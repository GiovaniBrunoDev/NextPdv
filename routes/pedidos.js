const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Criar novo pedido (reserva)
router.post("/", async (req, res) => {
  try {
    const { clienteId, observacoes, itens, dataEntrega } = req.body;

    if (!itens || itens.length === 0) {
      return res.status(400).json({ error: "Nenhum item informado." });
    }

    // Calcula total e reserva estoque
    let total = 0;

    for (const item of itens) {
      const variacao = await prisma.variacaoProduto.findUnique({
        where: { id: item.variacaoProdutoId },
      });

      if (!variacao) {
        return res.status(400).json({ error: `Variação ${item.variacaoProdutoId} não encontrada.` });
      }

      if (variacao.estoque < item.quantidade) {
        return res.status(400).json({ error: `Estoque insuficiente para ${variacao.numeracao}.` });
      }

      total += item.quantidade * item.precoUnitario;

      // Reserva no estoque
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: {
          estoque: { decrement: item.quantidade },
        },
      });
    }

    const pedido = await prisma.pedido.create({
      data: {
        clienteId,
        observacoes,
        dataEntrega: dataEntrega ? new Date(dataEntrega) : null,
        total,
        status: "reservado",
        itens: {
          create: itens.map((i) => ({
            variacaoProdutoId: i.variacaoProdutoId,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
            subtotal: i.quantidade * i.precoUnitario,
          })),
        },
      },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
    });

    res.status(201).json(pedido);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar pedido." });
  }
});

// Listar todos os pedidos
router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      orderBy: { dataCriacao: "desc" },
      include: {
        cliente: true,
        itens: { include: { variacaoProduto: { include: { produto: true } } } },
      },
    });
    res.json(pedidos);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

// Confirmar pedido
router.patch("/:id/confirmar", async (req, res) => {
  try {
    const pedido = await prisma.pedido.update({
      where: { id: Number(req.params.id) },
      data: { status: "confirmado" },
    });
    res.json(pedido);
  } catch (err) {
    res.status(500).json({ error: "Erro ao confirmar pedido." });
  }
});

// Cancelar pedido (repor estoque)
router.patch("/:id/cancelar", async (req, res) => {
  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id: Number(req.params.id) },
      include: { itens: true },
    });

    if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

    // Devolve o estoque dos itens
    for (const item of pedido.itens) {
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: { estoque: { increment: item.quantidade } },
      });
    }

    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { status: "cancelado" },
    });

    res.json({ message: "Pedido cancelado e estoque restaurado.", atualizado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao cancelar pedido." });
  }
});

module.exports = router;
