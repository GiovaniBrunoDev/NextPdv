const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { registrarVendaNoCaixa } = require("../services/caixaService");

const router = express.Router();
const prisma = new PrismaClient();

const STATUS_COM_ESTOQUE_RESERVADO = ["reservado", "agendado", "confirmado"];
const STATUS_FINAIS = ["cancelado", "entregue"];

function lojaId(req) {
  return req.loja.id;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
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

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
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
    if (!produtos.length) return res.status(400).json({ error: "Nenhum produto informado." });

    const itemInvalido = produtos.find(
      (item) =>
        !Number.isInteger(item.variacaoProdutoId) ||
        !Number.isInteger(item.quantidade) ||
        item.quantidade <= 0
    );
    if (itemInvalido) return res.status(400).json({ error: "Itens do pedido invalidos." });

    const novaDataEntrega = dataEntrega ? new Date(dataEntrega) : null;
    const clienteIdNumerico = toNumberOrNull(clienteId);
    const taxaEntregaNumerica = toNumberOrNull(taxaEntrega) ?? 0;
    const totalInformado = toNumberOrNull(total);

    const pedido = await prisma.$transaction(async (tx) => {
      if (clienteIdNumerico) {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteIdNumerico, lojaId: lojaId(req) },
        });
        if (!cliente) throw new Error("Cliente nao encontrado nesta loja.");
      }

      const itensComPreco = [];
      for (const item of produtos) {
        const variacao = await tx.variacaoProduto.findFirst({
          where: {
            id: item.variacaoProdutoId,
            produto: { lojaId: lojaId(req) },
          },
          include: { produto: true },
        });
        if (!variacao) throw new Error(`Variacao ${item.variacaoProdutoId} nao encontrada.`);

        const reserva = await tx.variacaoProduto.updateMany({
          where: {
            id: item.variacaoProdutoId,
            estoque: { gte: item.quantidade },
            produto: { lojaId: lojaId(req) },
          },
          data: { estoque: { decrement: item.quantidade } },
        });

        if (reserva.count === 0) {
          throw new Error(`Estoque insuficiente para ${variacao.produto.nome} (${variacao.numeracao}).`);
        }

        const precoUnitario = item.precoUnitario ?? variacao.produto.preco;
        itensComPreco.push({
          variacaoProdutoId: variacao.id,
          quantidade: item.quantidade,
          precoUnitario,
          subtotal: item.quantidade * precoUnitario,
        });
      }

      const subtotalItens = itensComPreco.reduce((acc, item) => acc + item.subtotal, 0);
      const totalPedido = totalInformado ?? subtotalItens + taxaEntregaNumerica;

      return tx.pedido.create({
        data: {
          lojaId: lojaId(req),
          clienteId: clienteIdNumerico || null,
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
              variacaoProdutoId: item.variacaoProdutoId,
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
    res.status(400).json({ error: error.message || "Erro interno ao criar pedido." });
  }
});

router.put("/:id/status", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || status === "confirmado") {
      return res.status(400).json({ error: "Para confirmar um pedido, use a acao de confirmar venda." });
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const pedidoAtual = await tx.pedido.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaId(req) },
        include: { itens: true },
      });
      if (!pedidoAtual) throw new Error("Pedido nao encontrado.");
      if (STATUS_FINAIS.includes(pedidoAtual.status)) throw new Error("Pedido ja foi finalizado.");

      if (status === "cancelado" && STATUS_COM_ESTOQUE_RESERVADO.includes(pedidoAtual.status)) {
        for (const item of pedidoAtual.itens) {
          await tx.variacaoProduto.update({
            where: { id: item.variacaoProdutoId },
            data: { estoque: { increment: item.quantidade } },
          });
        }
      }

      return tx.pedido.update({
        where: { id: pedidoAtual.id },
        data: { status },
        include: includePedidoCompleto(),
      });
    });

    res.json({ message: `Status atualizado para ${status}.`, pedido });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    res.status(400).json({ error: error.message || "Erro ao atualizar status do pedido." });
  }
});

router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        lojaId: lojaId(req),
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
        lojaId: lojaId(req),
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

router.post("/:id/confirmar", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const venda = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaId(req) },
        include: { itens: true },
      });
      if (!pedido) throw new Error("Pedido nao encontrado.");
      if (!STATUS_COM_ESTOQUE_RESERVADO.includes(pedido.status)) {
        throw new Error("Pedido nao esta com estoque reservado para confirmacao.");
      }

      const novaVenda = await tx.venda.create({
        data: {
          lojaId: lojaId(req),
          clienteId: pedido.clienteId || null,
          tipoEntrega: pedido.tipoEntrega,
          taxaEntrega: pedido.taxaEntrega,
          entregador: pedido.entregador,
          formaPagamento: pedido.formaPagamento,
          endereco: pedido.endereco,
          total: pedido.total,
          itens: {
            create: pedido.itens.map((item) => ({
              variacaoProdutoId: item.variacaoProdutoId,
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
            })),
          },
        },
        include: includeVendaCompleta(),
      });

      await registrarVendaNoCaixa(tx, {
        lojaId: lojaId(req),
        usuarioId: req.usuario?.id,
        vendaId: novaVenda.id,
        total: novaVenda.total,
        formaPagamento: novaVenda.formaPagamento,
      });

      await tx.itemPedido.deleteMany({ where: { pedidoId: pedido.id } });
      await tx.pedido.delete({ where: { id: pedido.id } });
      return novaVenda;
    });

    res.json({ message: "Pedido convertido em venda com sucesso!", venda });
  } catch (error) {
    console.error("Erro ao confirmar pedido:", error);
    res.status(400).json({ error: error.message || "Erro ao confirmar pedido." });
  }
});

module.exports = router;
