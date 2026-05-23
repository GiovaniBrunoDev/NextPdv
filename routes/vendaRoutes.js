const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

const vendaInclude = {
  cliente: {
    select: {
      id: true,
      nome: true,
      telefone: true,
      endereco: true,
      bairro: true,
      cidade: true,
      estado: true,
      cep: true,
      observacoes: true,
    },
  },
  itens: {
    include: {
      variacaoProduto: {
        include: {
          produto: true,
        },
      },
    },
  },
};

function lojaId(req) {
  return req.loja.id;
}

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  const {
    produtos,
    total,
    subtotalProdutos,
    desconto,
    formaPagamento,
    tipoEntrega,
    taxaEntrega,
    endereco,
    entregador,
    clienteId,
  } = req.body;

  if (!produtos || produtos.length === 0) {
    return res.status(400).json({ error: "Nenhum produto informado." });
  }

  try {
    const venda = await prisma.$transaction(async (tx) => {
      let enderecoFinal = endereco?.trim() || null;
      const clienteIdNumerico = clienteId ? Number(clienteId) : null;

      if (clienteIdNumerico) {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteIdNumerico, lojaId: lojaId(req) },
        });
        if (!cliente) throw new Error("Cliente nao encontrado nesta loja.");

        if (tipoEntrega === "entrega") {
          if (!enderecoFinal) {
            enderecoFinal = `${cliente.endereco || ""}, ${cliente.bairro || ""}, ${cliente.cidade || ""} - ${cliente.estado || ""}, ${cliente.cep || ""}`.trim();
          } else if (!cliente.endereco && enderecoFinal) {
            await tx.cliente.update({
              where: { id: clienteIdNumerico },
              data: { endereco: enderecoFinal },
            });
          }
        }
      }

      const novaVenda = await tx.venda.create({
        data: {
          lojaId: lojaId(req),
          total,
          subtotalProdutos: subtotalProdutos === undefined ? null : Number(subtotalProdutos || 0),
          desconto: desconto === undefined ? 0 : Number(desconto || 0),
          formaPagamento,
          tipoEntrega,
          taxaEntrega,
          endereco: enderecoFinal,
          entregador,
          clienteId: clienteIdNumerico,
        },
      });

      for (const item of produtos) {
        const variacao = await tx.variacaoProduto.findFirst({
          where: {
            id: Number(item.variacaoProdutoId),
            produto: { lojaId: lojaId(req) },
          },
          include: { produto: true },
        });

        if (!variacao) throw new Error(`Variacao ${item.variacaoProdutoId} nao encontrada.`);

        await tx.itemVenda.create({
          data: {
            vendaId: novaVenda.id,
            variacaoProdutoId: variacao.id,
            quantidade: Number(item.quantidade),
            precoUnitario: variacao.produto.preco,
            custoUnitario: variacao.produto.custoUnitario,
            outrosCustos: variacao.produto.outrosCustos,
          },
        });

        await tx.variacaoProduto.update({
          where: { id: variacao.id },
          data: { estoque: { decrement: Number(item.quantidade) } },
        });
      }

      return tx.venda.findUnique({ where: { id: novaVenda.id }, include: vendaInclude });
    });

    return res.status(201).json({ mensagem: "Venda registrada com sucesso!", vendaId: venda.id, venda });
  } catch (error) {
    console.error("Erro ao registrar venda:", error);
    return res.status(400).json({ error: error.message || "Erro ao registrar venda." });
  }
});

router.get("/", async (req, res) => {
  try {
    const vendas = await prisma.venda.findMany({
      where: { lojaId: lojaId(req) },
      orderBy: { data: "desc" },
      include: vendaInclude,
    });

    res.json(vendas);
  } catch (error) {
    console.error("Erro ao listar vendas:", error);
    res.status(500).json({ erro: "Erro ao listar vendas." });
  }
});

router.put("/:id", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const vendaId = Number(req.params.id);
  const { formaPagamento, tipoEntrega, taxaEntrega, endereco, entregador, clienteId } = req.body;

  try {
    const venda = await prisma.venda.findFirst({ where: { id: vendaId, lojaId: lojaId(req) } });
    if (!venda) return res.status(404).json({ error: "Venda nao encontrada." });

    if (clienteId) {
      const cliente = await prisma.cliente.findFirst({
        where: { id: Number(clienteId), lojaId: lojaId(req) },
      });
      if (!cliente) return res.status(400).json({ error: "Cliente nao encontrado nesta loja." });
    }

    const data = {};
    if (formaPagamento !== undefined) data.formaPagamento = formaPagamento || null;
    if (tipoEntrega !== undefined) data.tipoEntrega = tipoEntrega || null;
    if (taxaEntrega !== undefined) data.taxaEntrega = taxaEntrega === "" || taxaEntrega === null ? null : Number(taxaEntrega);
    if (endereco !== undefined) data.endereco = endereco?.trim() || null;
    if (entregador !== undefined) data.entregador = entregador?.trim() || null;
    if (clienteId !== undefined) data.clienteId = clienteId ? Number(clienteId) : null;

    await prisma.venda.update({ where: { id: vendaId }, data });

    const vendaAtualizada = await prisma.venda.findUnique({
      where: { id: vendaId },
      include: vendaInclude,
    });

    res.json(vendaAtualizada);
  } catch (error) {
    console.error("Erro ao atualizar venda:", error);
    res.status(500).json({ error: "Erro ao atualizar venda." });
  }
});

router.delete("/:id", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const id = Number(req.params.id);

  try {
    const venda = await prisma.venda.findFirst({
      where: { id, lojaId: lojaId(req) },
      include: { itens: true },
    });

    if (!venda) return res.status(404).json({ error: "Venda nao encontrada." });

    await prisma.$transaction(async (tx) => {
      for (const item of venda.itens) {
        await tx.variacaoProduto.update({
          where: { id: item.variacaoProdutoId },
          data: { estoque: { increment: item.quantidade } },
        });
      }

      await tx.itemVenda.deleteMany({ where: { vendaId: venda.id } });
      await tx.venda.delete({ where: { id: venda.id } });
    });

    res.json({ mensagem: "Venda excluida com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir venda:", error);
    res.status(500).json({ error: "Erro ao excluir venda." });
  }
});

router.post("/troca", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  const { vendaId, itemId, novaVariacaoId } = req.body;

  try {
    const vendaAtualizada = await prisma.$transaction(async (tx) => {
      const venda = await tx.venda.findFirst({
        where: { id: Number(vendaId), lojaId: lojaId(req) },
        include: { itens: true },
      });
      if (!venda) throw new Error("Venda nao encontrada.");

      const item = venda.itens.find((i) => i.id === Number(itemId));
      if (!item) throw new Error("Item da venda nao encontrado.");

      const variacaoNova = await tx.variacaoProduto.findFirst({
        where: {
          id: Number(novaVariacaoId),
          produto: { lojaId: lojaId(req) },
        },
        include: { produto: true },
      });
      if (!variacaoNova) throw new Error("Nova variacao nao encontrada.");
      if (variacaoNova.estoque < item.quantidade) throw new Error("Estoque insuficiente para a nova variacao.");

      await tx.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: { estoque: { increment: item.quantidade } },
      });

      await tx.itemVenda.update({
        where: { id: item.id },
        data: {
          variacaoProdutoId: variacaoNova.id,
          precoUnitario: item.precoUnitario ?? variacaoNova.produto.preco,
          custoUnitario: variacaoNova.produto.custoUnitario,
          outrosCustos: variacaoNova.produto.outrosCustos,
        },
      });

      await tx.variacaoProduto.update({
        where: { id: variacaoNova.id },
        data: { estoque: { decrement: item.quantidade } },
      });

      return tx.venda.findUnique({ where: { id: venda.id }, include: vendaInclude });
    });

    res.json({ mensagem: "Troca realizada com sucesso!", venda: vendaAtualizada });
  } catch (error) {
    console.error("Erro ao realizar troca:", error);
    res.status(400).json({ error: error.message || "Erro ao realizar troca." });
  }
});

module.exports = router;
