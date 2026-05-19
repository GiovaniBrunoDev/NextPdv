const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
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

// POST /vendas
router.post("/", async (req, res) => {
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
    let enderecoFinal = endereco?.trim() || null;

    if (clienteId) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
      });

      if (tipoEntrega === "entrega") {
        if (!enderecoFinal) {
          enderecoFinal = `${cliente?.endereco || ""}, ${cliente?.bairro || ""}, ${cliente?.cidade || ""} - ${cliente?.estado || ""}, ${cliente?.cep || ""}`.trim();
        } else if (!cliente?.endereco && enderecoFinal) {
          await prisma.cliente.update({
            where: { id: clienteId },
            data: {
              endereco: enderecoFinal,
            },
          });
        }
      }
    }

    const novaVenda = await prisma.venda.create({
      data: {
        total,
        subtotalProdutos: subtotalProdutos === undefined ? null : Number(subtotalProdutos || 0),
        desconto: desconto === undefined ? 0 : Number(desconto || 0),
        formaPagamento,
        tipoEntrega,
        taxaEntrega,
        endereco: enderecoFinal,
        entregador,
        clienteId,
      },
    });

    for (const item of produtos) {
      const variacao = await prisma.variacaoProduto.findUnique({
        where: { id: item.variacaoProdutoId },
        include: { produto: true },
      });

      if (!variacao) {
        return res.status(400).json({ error: `Variação ${item.variacaoProdutoId} não encontrada.` });
      }

      await prisma.itemVenda.create({
        data: {
          vendaId: novaVenda.id,
          variacaoProdutoId: item.variacaoProdutoId,
          quantidade: item.quantidade,
          precoUnitario: variacao.produto.preco,
          custoUnitario: variacao.produto.custoUnitario,
          outrosCustos: variacao.produto.outrosCustos,
        },
      });

      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: {
          estoque: {
            decrement: item.quantidade,
          },
        },
      });
    }

    return res.status(201).json({ mensagem: "Venda registrada com sucesso!", vendaId: novaVenda.id });
  } catch (error) {
    console.error("Erro ao registrar venda:", error);
    return res.status(500).json({ erro: "Erro ao registrar venda." });
  }
});

// GET /vendas
router.get("/", async (req, res) => {
  try {
    const vendas = await prisma.venda.findMany({
      orderBy: { data: "desc" },
      include: vendaInclude,
    });

    res.json(vendas);
  } catch (error) {
    console.error("Erro ao listar vendas:", error);
    res.status(500).json({ erro: "Erro ao listar vendas." });
  }
});

// PUT /vendas/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    formaPagamento,
    tipoEntrega,
    taxaEntrega,
    endereco,
    entregador,
    clienteId,
  } = req.body;

  try {
    const vendaId = parseInt(id);
    const data = {};

    if (formaPagamento !== undefined) data.formaPagamento = formaPagamento || null;
    if (tipoEntrega !== undefined) data.tipoEntrega = tipoEntrega || null;
    if (taxaEntrega !== undefined) data.taxaEntrega = taxaEntrega === "" || taxaEntrega === null ? null : Number(taxaEntrega);
    if (endereco !== undefined) data.endereco = endereco?.trim() || null;
    if (entregador !== undefined) data.entregador = entregador?.trim() || null;
    if (clienteId !== undefined) data.clienteId = clienteId ? Number(clienteId) : null;

    await prisma.venda.update({
      where: { id: vendaId },
      data,
    });

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

// DELETE /vendas/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const venda = await prisma.venda.findUnique({
      where: { id: parseInt(id) },
      include: { itens: true },
    });

    if (!venda) {
      return res.status(404).json({ error: "Venda não encontrada." });
    }

    for (const item of venda.itens) {
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: {
          estoque: {
            increment: item.quantidade,
          },
        },
      });
    }

    await prisma.itemVenda.deleteMany({
      where: { vendaId: venda.id },
    });

    await prisma.venda.delete({
      where: { id: venda.id },
    });

    res.json({ mensagem: "Venda excluída com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir venda:", error);
    res.status(500).json({ error: "Erro ao excluir venda." });
  }
});

// POST /vendas/troca
router.post("/troca", async (req, res) => {
  const { vendaId, itemId, novaVariacaoId } = req.body;

  try {
    const venda = await prisma.venda.findUnique({
      where: { id: parseInt(vendaId) },
      include: {
        itens: true,
      },
    });

    if (!venda) {
      return res.status(404).json({ error: "Venda não encontrada." });
    }

    const item = venda.itens.find((i) => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).json({ error: "Item da venda não encontrado." });
    }

    await prisma.variacaoProduto.update({
      where: { id: item.variacaoProdutoId },
      data: {
        estoque: {
          increment: item.quantidade,
        },
      },
    });

    const variacaoNova = await prisma.variacaoProduto.findUnique({
      where: { id: novaVariacaoId },
      include: { produto: true },
    });

    if (!variacaoNova) {
      return res.status(400).json({ error: "Nova variação não encontrada." });
    }

    if (variacaoNova.estoque < item.quantidade) {
      return res.status(400).json({ error: "Estoque insuficiente para a nova variação." });
    }

    await prisma.itemVenda.update({
      where: { id: item.id },
      data: {
        variacaoProdutoId: novaVariacaoId,
        precoUnitario: item.precoUnitario ?? variacaoNova.produto.preco,
        custoUnitario: variacaoNova.produto.custoUnitario,
        outrosCustos: variacaoNova.produto.outrosCustos,
      },
    });

    await prisma.variacaoProduto.update({
      where: { id: novaVariacaoId },
      data: {
        estoque: {
          decrement: item.quantidade,
        },
      },
    });

    const vendaAtualizada = await prisma.venda.findUnique({
      where: { id: venda.id },
      include: vendaInclude,
    });

    res.json({ mensagem: "Troca realizada com sucesso!", venda: vendaAtualizada });
  } catch (error) {
    console.error("Erro ao realizar troca:", error);
    res.status(500).json({ error: "Erro ao realizar troca." });
  }
});

module.exports = router;
