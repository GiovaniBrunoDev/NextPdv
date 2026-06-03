const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { registrarVendaNoCaixa } = require("../services/caixaService");
const { registrarMovimentoEstoque } = require("../services/estoqueMovimentoService");
const { mensagemPublica } = require("../services/errorResponse");

const router = express.Router();
const prisma = new PrismaClient();
const transacaoOperacionalOpcoes = { maxWait: 10000, timeout: 20000 };

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

function numeroValido(valor, fallback = 0) {
  const numero = Number(valor ?? fallback);
  return Number.isFinite(numero) ? numero : fallback;
}

function itemManual(item) {
  if (item.manual || item.tipo === "manual") return true;
  if (item.variacaoProdutoId === null || item.variacaoProdutoId === undefined) return true;
  return String(item.variacaoProdutoId).startsWith("manual-");
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
        const quantidade = numeroValido(item.quantidade);
        if (!Number.isInteger(quantidade) || quantidade <= 0) {
          throw new Error("Quantidade invalida em um item da venda.");
        }

        if (itemManual(item)) {
          const nomeManual = String(item.nome || item.nomeManual || "").trim();
          const numeracaoManual = String(item.numeracao || item.numeracaoManual || "").trim() || null;
          const precoUnitario = numeroValido(item.precoUnitario ?? item.preco ?? item.valorVenda);
          const custoUnitario = numeroValido(item.custoUnitario ?? item.valorCusto);
          const outrosCustos = numeroValido(item.outrosCustos);

          if (!nomeManual) throw new Error("Informe o nome do item fora de estoque.");
          if (precoUnitario <= 0) throw new Error(`Informe o valor de venda do item "${nomeManual}".`);
          if (custoUnitario < 0 || outrosCustos < 0) throw new Error(`Informe custos validos para "${nomeManual}".`);

          await tx.itemVenda.create({
            data: {
              vendaId: novaVenda.id,
              variacaoProdutoId: null,
              nomeManual,
              numeracaoManual,
              quantidade,
              precoUnitario,
              custoUnitario,
              outrosCustos,
            },
          });

          continue;
        }

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
            quantidade,
            precoUnitario: variacao.produto.preco,
            custoUnitario: variacao.produto.custoUnitario,
            outrosCustos: variacao.produto.outrosCustos,
          },
        });

        const baixa = await tx.variacaoProduto.updateMany({
          where: {
            id: variacao.id,
            estoque: { gte: quantidade },
          },
          data: { estoque: { decrement: quantidade } },
        });
        if (baixa.count === 0) {
          throw new Error(`Estoque insuficiente para ${variacao.produto.nome} (${variacao.numeracao}).`);
        }

        await registrarMovimentoEstoque(tx, {
          lojaId: lojaId(req),
          variacaoProdutoId: variacao.id,
          usuarioId: req.usuario?.id,
          tipo: "venda",
          quantidade: -quantidade,
          saldoAnterior: variacao.estoque,
          saldoFinal: variacao.estoque - quantidade,
          origemTipo: "venda",
          origemId: novaVenda.id,
        });
      }

      await registrarVendaNoCaixa(tx, {
        lojaId: lojaId(req),
        usuarioId: req.usuario?.id,
        vendaId: novaVenda.id,
        total: novaVenda.total,
        formaPagamento,
      });

      return tx.venda.findUnique({ where: { id: novaVenda.id }, include: vendaInclude });
    }, transacaoOperacionalOpcoes);

    return res.status(201).json({ mensagem: "Venda registrada com sucesso!", vendaId: venda.id, venda });
  } catch (error) {
    console.error("Erro ao registrar venda:", error);
    return res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel registrar a venda. Tente novamente.") });
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
        if (!item.variacaoProdutoId) continue;

        const variacao = await tx.variacaoProduto.findUnique({
          where: { id: item.variacaoProdutoId },
        });
        if (!variacao) continue;

        const variacaoAtualizada = await tx.variacaoProduto.update({
          where: { id: item.variacaoProdutoId },
          data: { estoque: { increment: item.quantidade } },
        });

        await registrarMovimentoEstoque(tx, {
          lojaId: lojaId(req),
          variacaoProdutoId: item.variacaoProdutoId,
          usuarioId: req.usuario?.id,
          tipo: "cancelamento_venda",
          quantidade: item.quantidade,
          saldoAnterior: variacao.estoque,
          saldoFinal: variacaoAtualizada.estoque,
          origemTipo: "venda",
          origemId: venda.id,
        });
      }

      await tx.itemVenda.deleteMany({ where: { vendaId: venda.id } });
      await tx.venda.delete({ where: { id: venda.id } });
    }, transacaoOperacionalOpcoes);

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
      if (!item.variacaoProdutoId) throw new Error("Item fora de estoque nao pode ser trocado pelo controle de estoque.");

      const variacaoNova = await tx.variacaoProduto.findFirst({
        where: {
          id: Number(novaVariacaoId),
          produto: { lojaId: lojaId(req) },
        },
        include: { produto: true },
      });
      if (!variacaoNova) throw new Error("Nova variacao nao encontrada.");
      if (variacaoNova.estoque < item.quantidade) throw new Error("Estoque insuficiente para a nova variacao.");

      const variacaoAnterior = await tx.variacaoProduto.findUnique({
        where: { id: item.variacaoProdutoId },
      });
      if (!variacaoAnterior) throw new Error("Variacao original nao encontrada.");

      const variacaoAnteriorAtualizada = await tx.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: { estoque: { increment: item.quantidade } },
      });
      await registrarMovimentoEstoque(tx, {
        lojaId: lojaId(req),
        variacaoProdutoId: item.variacaoProdutoId,
        usuarioId: req.usuario?.id,
        tipo: "troca_retorno",
        quantidade: item.quantidade,
        saldoAnterior: variacaoAnterior.estoque,
        saldoFinal: variacaoAnteriorAtualizada.estoque,
        origemTipo: "venda",
        origemId: venda.id,
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

      const baixaNovaVariacao = await tx.variacaoProduto.updateMany({
        where: {
          id: variacaoNova.id,
          estoque: { gte: item.quantidade },
        },
        data: { estoque: { decrement: item.quantidade } },
      });
      if (baixaNovaVariacao.count === 0) throw new Error("Estoque insuficiente para a nova variacao.");
      await registrarMovimentoEstoque(tx, {
        lojaId: lojaId(req),
        variacaoProdutoId: variacaoNova.id,
        usuarioId: req.usuario?.id,
        tipo: "troca_saida",
        quantidade: -item.quantidade,
        saldoAnterior: variacaoNova.estoque,
        saldoFinal: variacaoNova.estoque - item.quantidade,
        origemTipo: "venda",
        origemId: venda.id,
      });

      return tx.venda.findUnique({ where: { id: venda.id }, include: vendaInclude });
    }, transacaoOperacionalOpcoes);

    res.json({ mensagem: "Troca realizada com sucesso!", venda: vendaAtualizada });
  } catch (error) {
    console.error("Erro ao realizar troca:", error);
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel concluir a troca. Tente novamente.") });
  }
});

module.exports = router;
