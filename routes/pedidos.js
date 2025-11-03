const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * 🟢 Criar pedido (imediato ou agendado)
 */
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
      produtos: produtosDoBody,
      itens: itensDoBody,
    } = req.body;

    const produtos = produtosDoBody || itensDoBody;
    if (!produtos?.length)
      return res.status(400).json({ error: "Nenhum produto informado." });

    // Validar estoque e garantir preço unitário
    for (const item of produtos) {
      const variacao = await prisma.variacaoProduto.findUnique({
        where: { id: item.variacaoProdutoId },
        include: { produto: true },
      });

      if (!variacao)
        return res.status(404).json({
          error: `Variação ${item.variacaoProdutoId} não encontrada.`,
        });

      if (variacao.estoque < item.quantidade)
        return res.status(400).json({
          error: `Estoque insuficiente para ${variacao.produto.nome} (${variacao.numeracao}).`,
        });

      item.precoUnitario = item.precoUnitario ?? variacao.produto.preco;
    }

    const novaDataEntrega = dataEntrega ? new Date(dataEntrega) : null;

    const novoPedido = await prisma.pedido.create({
      data: {
        cliente: clienteId ? { connect: { id: clienteId } } : undefined,
        observacoes,
        dataEntrega: novaDataEntrega,
        horarioEntrega,
        tipoEntrega,
        endereco,
        entregador,
        formaPagamento,
        taxaEntrega,
        status: novaDataEntrega ? "agendado" : "reservado",
        itens: {
          create: produtos.map((item) => ({
            variacaoProduto: { connect: { id: item.variacaoProdutoId } },
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            subtotal: item.quantidade * item.precoUnitario,
          })),
        },
      },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
    });

    // Atualizar estoque
    for (const item of produtos) {
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: { estoque: { decrement: item.quantidade } },
      });
    }

    // Calcular total
    const total = produtos.reduce(
      (acc, i) => acc + i.quantidade * i.precoUnitario,
      0
    );

    const pedidoFinal = await prisma.pedido.update({
      where: { id: novoPedido.id },
      data: { total },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
    });

    res.status(201).json({ message: "Pedido criado com sucesso!", pedido: pedidoFinal });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    res.status(500).json({ error: "Erro interno ao criar pedido." });
  }
});

/**
 * 🔄 Atualizar status
 */
router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const pedido = await prisma.pedido.findUnique({
      where: { id: Number(id) },
      include: { itens: true },
    });
    if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

    if (status === "cancelado" && pedido.status !== "cancelado") {
      // Repor estoque
      for (const item of pedido.itens) {
        await prisma.variacaoProduto.update({
          where: { id: item.variacaoProdutoId },
          data: { estoque: { increment: item.quantidade } },
        });
      }
    }

    const atualizado = await prisma.pedido.update({
      where: { id: Number(id) },
      data: { status },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
    });

    res.json({ message: `Status atualizado para ${status}.`, pedido: atualizado });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    res.status(500).json({ error: "Erro ao atualizar status do pedido." });
  }
});

/**
 * 🔵 Listar pedidos (ativos)
 */
router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        status: { notIn: ["entregue", "cancelado"] },
      },
      orderBy: { dataCriacao: "desc" },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
    });
    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

/**
 * 🔔 Pedidos de hoje
 */
router.get("/hoje", async (req, res) => {
  try {
    const agora = new Date();
    const inicio = new Date(agora.setHours(0, 0, 0, 0));
    const fim = new Date(agora.setHours(23, 59, 59, 999));

    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        dataEntrega: { gte: inicio, lte: fim },
        status: { notIn: ["cancelado", "entregue"] },
      },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
      orderBy: { horarioEntrega: "asc" },
    });

    res.json(pedidosHoje);
  } catch (error) {
    console.error("Erro ao buscar pedidos de hoje:", error);
    res.status(500).json({ error: "Erro ao buscar pedidos do dia." });
  }
});

/**
 * ✅ Confirmar pedido → converter em venda e remover o pedido
 */
router.post("/:id/confirmar", async (req, res) => {
  try {
    const { id } = req.params;

    const pedido = await prisma.pedido.findUnique({
      where: { id: Number(id) },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: true } },
      },
    });

    if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

    const venda = await prisma.venda.create({
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
            precoUnitario: item.precoUnitario,
            subtotal: item.subtotal,
          })),
        },
      },
    });

    // Excluir pedido e itens
    await prisma.itemPedido.deleteMany({ where: { pedidoId: pedido.id } });
    await prisma.pedido.delete({ where: { id: pedido.id } });

    res.json({ message: "Pedido convertido em venda com sucesso!", venda });
  } catch (error) {
    console.error("Erro ao confirmar pedido:", error);
    res.status(500).json({ error: "Erro ao confirmar pedido." });
  }
});

module.exports = router;
