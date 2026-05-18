const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const STATUS_COM_ESTOQUE_RESERVADO = ["reservado", "agendado"];
const STATUS_FINAIS = ["cancelado", "entregue"];

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numero = Number(value);
  return Number.isFinite(numero) ? numero : null;
}

function montarItensPedido(itens) {
  return itens.map((item) => ({
    variacaoProdutoId: Number(item.variacaoProdutoId),
    quantidade: Number(item.quantidade),
    precoUnitario: toNumberOrNull(item.precoUnitario),
  }));
}

function includePedidoCompleto() {
  return {
    cliente: true,
    itens: { include: { variacaoProduto: { include: { produto: true } } } },
  };
}

function includeVendaCompleta() {
  return {
    cliente: true,
    itens: { include: { variacaoProduto: { include: { produto: true } } } },
  };
}

router.post("/", async (req, res) => {
  try {
    const {
      clienteId,
      observacoes,
      dataEntrega,
      horarioEntrega,
      tipoEntrega,
      endereco,
      entregador,
      formaPagamento,
      taxaEntrega,
      total,
      produtos: produtosDoBody,
      itens: itensDoBody,
    } = req.body;

    const produtos = montarItensPedido(produtosDoBody || itensDoBody || []);

    if (!produtos.length) {
      return res.status(400).json({ error: "Nenhum produto informado." });
    }

    const itemInvalido = produtos.find(
      (item) =>
        !Number.isInteger(item.variacaoProdutoId) ||
        !Number.isInteger(item.quantidade) ||
        item.quantidade <= 0
    );

    if (itemInvalido) {
      return res.status(400).json({ error: "Itens do pedido invalidos." });
    }

    const novaDataEntrega = dataEntrega ? new Date(dataEntrega) : null;
    const clienteIdNumerico = toNumberOrNull(clienteId);
    const taxaEntregaNumerica = toNumberOrNull(taxaEntrega) ?? 0;
    const totalInformado = toNumberOrNull(total);

    if (clienteId && !Number.isInteger(clienteIdNumerico)) {
      return res.status(400).json({ error: "Cliente invalido." });
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const itensComPreco = [];

      for (const item of produtos) {
        const variacao = await tx.variacaoProduto.findUnique({
          where: { id: item.variacaoProdutoId },
          include: { produto: true },
        });

        if (!variacao) {
          const erro = new Error(`Variacao ${item.variacaoProdutoId} nao encontrada.`);
          erro.statusCode = 404;
          throw erro;
        }

        const reserva = await tx.variacaoProduto.updateMany({
          where: {
            id: item.variacaoProdutoId,
            estoque: { gte: item.quantidade },
          },
          data: { estoque: { decrement: item.quantidade } },
        });

        if (reserva.count === 0) {
          const erro = new Error(
            `Estoque insuficiente para ${variacao.produto.nome} (${variacao.numeracao}).`
          );
          erro.statusCode = 400;
          throw erro;
        }

        const precoUnitario = item.precoUnitario ?? variacao.produto.preco;
        itensComPreco.push({
          variacaoProdutoId: item.variacaoProdutoId,
          quantidade: item.quantidade,
          precoUnitario,
          subtotal: item.quantidade * precoUnitario,
        });
      }

      const subtotalItens = itensComPreco.reduce((acc, item) => acc + item.subtotal, 0);
      const totalPedido = totalInformado ?? subtotalItens + taxaEntregaNumerica;

      return tx.pedido.create({
        data: {
          cliente: clienteIdNumerico ? { connect: { id: clienteIdNumerico } } : undefined,
          observacoes,
          dataEntrega: novaDataEntrega,
          horarioEntrega,
          tipoEntrega,
          endereco,
          entregador,
          formaPagamento,
          taxaEntrega: taxaEntregaNumerica,
          total: totalPedido,
          status: novaDataEntrega ? "agendado" : "reservado",
          itens: {
            create: itensComPreco.map((item) => ({
              variacaoProduto: { connect: { id: item.variacaoProdutoId } },
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              subtotal: item.subtotal,
            })),
          },
        },
        include: includePedidoCompleto(),
      });
    });

    res.status(201).json({ message: "Pedido criado com sucesso!", pedido });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Erro interno ao criar pedido." });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || status === "confirmado") {
      return res
        .status(400)
        .json({ error: "Para confirmar um pedido, use a acao de confirmar venda." });
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const pedidoAtual = await tx.pedido.findUnique({
        where: { id: Number(id) },
        include: { itens: true },
      });

      if (!pedidoAtual) {
        const erro = new Error("Pedido nao encontrado.");
        erro.statusCode = 404;
        throw erro;
      }

      if (STATUS_FINAIS.includes(pedidoAtual.status)) {
        const erro = new Error("Pedido ja foi finalizado.");
        erro.statusCode = 400;
        throw erro;
      }

      if (status === "cancelado" && STATUS_COM_ESTOQUE_RESERVADO.includes(pedidoAtual.status)) {
        for (const item of pedidoAtual.itens) {
          await tx.variacaoProduto.update({
            where: { id: item.variacaoProdutoId },
            data: { estoque: { increment: item.quantidade } },
          });
        }
      }

      return tx.pedido.update({
        where: { id: Number(id) },
        data: { status },
        include: includePedidoCompleto(),
      });
    });

    res.json({ message: `Status atualizado para ${status}.`, pedido });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Erro ao atualizar status do pedido." });
  }
});

router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        status: { notIn: STATUS_FINAIS },
      },
      orderBy: { dataCriacao: "desc" },
      include: includePedidoCompleto(),
    });

    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

router.get("/hoje", async (req, res) => {
  try {
    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(agora);
    fim.setHours(23, 59, 59, 999);

    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        dataEntrega: { gte: inicio, lte: fim },
        status: { notIn: STATUS_FINAIS },
      },
      include: includePedidoCompleto(),
      orderBy: { horarioEntrega: "asc" },
    });

    res.json(pedidosHoje);
  } catch (error) {
    console.error("Erro ao buscar pedidos de hoje:", error);
    res.status(500).json({ error: "Erro ao buscar pedidos do dia." });
  }
});

router.post("/:id/confirmar", async (req, res) => {
  try {
    const { id } = req.params;

    const venda = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id: Number(id) },
        include: { itens: true },
      });

      if (!pedido) {
        const erro = new Error("Pedido nao encontrado.");
        erro.statusCode = 404;
        throw erro;
      }

      if (!STATUS_COM_ESTOQUE_RESERVADO.includes(pedido.status)) {
        const erro = new Error("Pedido nao esta com estoque reservado para confirmacao.");
        erro.statusCode = 400;
        throw erro;
      }

      const novaVenda = await tx.venda.create({
        data: {
          cliente: pedido.clienteId ? { connect: { id: pedido.clienteId } } : undefined,
          tipoEntrega: pedido.tipoEntrega,
          taxaEntrega: pedido.taxaEntrega,
          entregador: pedido.entregador,
          formaPagamento: pedido.formaPagamento,
          endereco: pedido.endereco,
          total: pedido.total,
          itens: {
            create: pedido.itens.map((item) => ({
              variacaoProduto: { connect: { id: item.variacaoProdutoId } },
              quantidade: item.quantidade,
            })),
          },
        },
        include: includeVendaCompleta(),
      });

      await tx.itemPedido.deleteMany({ where: { pedidoId: pedido.id } });
      await tx.pedido.delete({ where: { id: pedido.id } });

      return novaVenda;
    });

    res.json({ message: "Pedido convertido em venda com sucesso!", venda });
  } catch (error) {
    console.error("Erro ao confirmar pedido:", error);
    res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Erro ao confirmar pedido." });
  }
});

module.exports = router;
