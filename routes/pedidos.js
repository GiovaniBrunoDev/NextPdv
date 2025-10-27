const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * 🟢 Criar pedido (imediato ou agendado)
 */
router.post("/", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body); // 🔹 Adicione isso
    const {
      clienteId,
      observacoes,
      dataEntrega,
      horarioEntrega,
      tipoEntrega, // "entrega" ou "retirada"
      endereco,
      produtos, // [{ variacaoProdutoId, quantidade, precoUnitario }]
      
    } = req.body;

    if (!produtos || produtos.length === 0)
      return res.status(400).json({ error: "Nenhum produto informado." });

    // Valida o estoque antes de criar o pedido
    for (const item of produtos) {
      const variacao = await prisma.variacaoProduto.findUnique({
        where: { id: item.variacaoProdutoId },
      });
      if (!variacao) {
        return res.status(404).json({ error: `Variação ${item.variacaoProdutoId} não encontrada.` });
      }
      if (variacao.estoque < item.quantidade) {
        return res.status(400).json({
          error: `Estoque insuficiente para o produto ${variacao.produtoId} (numeração ${variacao.numeracao}).`,
        });
      }

      // Garante que precoUnitario nunca seja undefined
      if (item.precoUnitario === undefined || item.precoUnitario === null) {
        item.precoUnitario = variacao.produto.preco; // pega o preço do produto padrão
      }
    }

    const novaDataEntrega = dataEntrega ? new Date(dataEntrega) : null;

    const novoPedido = await prisma.pedido.create({
      data: {
        clienteId,
        observacoes,
        dataEntrega: novaDataEntrega,
        horarioEntrega,
        tipoEntrega,
        endereco,
        status: novaDataEntrega ? "agendado" : "reservado",
      },
    });

    let total = 0;
    for (const item of produtos) {
      const subtotal = item.quantidade * item.precoUnitario;
      total += subtotal;

      await prisma.itemPedido.create({
        data: {
          pedidoId: novoPedido.id,
          variacaoProdutoId: item.variacaoProdutoId,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          subtotal,
        },
      });

      // Reserva o estoque
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: { estoque: { decrement: item.quantidade } },
      });
    }

    const pedidoFinal = await prisma.pedido.update({
      where: { id: novoPedido.id },
      data: { total },
      include: {
        cliente: true,
        itens: {
          include: {
            variacaoProduto: {
              include: { produto: true },
            },
          },
        },
      },
    });

    res.status(201).json({
      message: "Pedido criado com sucesso!",
      pedido: pedidoFinal,
    });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    res.status(500).json({ error: "Erro interno ao criar pedido." });
  }
});

/**
 * 🔄 Atualizar status (reservado → confirmado → entregue / cancelado)
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

    // 🔁 Se cancelar → devolve estoque
    if (status === "cancelado" && pedido.status !== "cancelado") {
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
        itens: {
          include: { variacaoProduto: { include: { produto: true } } },
        },
      },
    });

    res.json({
      message: `Status do pedido atualizado para ${status}.`,
      pedido: atualizado,
    });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    res.status(500).json({ error: "Erro ao atualizar status do pedido." });
  }
});

/**
 * 🔵 Listar todos os pedidos
 */
router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      orderBy: { dataCriacao: "desc" },
      include: {
        cliente: true,
        itens: {
          include: {
            variacaoProduto: {
              include: { produto: true },
            },
          },
        },
      },
    });

    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

/**
 * 🔔 Buscar pedidos agendados para HOJE
 */
router.get("/hoje", async (req, res) => {
  try {
    const agora = new Date();
    const inicio = new Date(agora.setHours(0, 0, 0, 0));
    const fim = new Date(agora.setHours(23, 59, 59, 999));

    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        dataEntrega: {
          gte: inicio,
          lte: fim,
        },
        status: { not: "cancelado" },
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

module.exports = router;
