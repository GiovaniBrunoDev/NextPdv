const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// POST /vendas
// POST /vendas
router.post("/", async (req, res) => {
  const {
    produtos,         // [{ variacaoProdutoId: 1, quantidade: 2 }]
    total,
    formaPagamento,
    tipoEntrega,
    taxaEntrega,
    endereco,
    entregador,
    clienteId
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
      // Monta o endereço a partir do cadastro do cliente
      enderecoFinal = `${cliente?.endereco || ""}, ${cliente?.bairro || ""}, ${cliente?.cidade || ""} - ${cliente?.estado || ""}, ${cliente?.cep || ""}`.trim();
    } else if (!cliente?.endereco && enderecoFinal) {
      // Atualiza o cadastro do cliente com o novo endereço informado
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          endereco: enderecoFinal
        }
      });
    }
  }
}

    const novaVenda = await prisma.venda.create({
      data: {
        total,
        formaPagamento,
        tipoEntrega,
        taxaEntrega,
        endereco: enderecoFinal,
        entregador,
        clienteId,
      }
    });

    for (const item of produtos) {
      const variacao = await prisma.variacaoProduto.findUnique({
        where: { id: item.variacaoProdutoId }
      });

      if (!variacao) {
        return res.status(400).json({ error: `Variação ${item.variacaoProdutoId} não encontrada.` });
      }

      await prisma.itemVenda.create({
        data: {
          vendaId: novaVenda.id,
          variacaoProdutoId: item.variacaoProdutoId,
          quantidade: item.quantidade
        }
      });

      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: {
          estoque: {
            decrement: item.quantidade
          }
        }
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
  include: {
    cliente: {
      select: {
        id: true,
        nome: true,
        telefone: true,
        endereco: true,
        bairro: true,
        cidade: true,
        estado: true,
        cep: true
      }
    },
    itens: {
      include: {
        variacaoProduto: {
          include: {
            produto: true
          }
        }
      }
    }
  }
});


    res.json(vendas);
  } catch (error) {
    console.error("Erro ao listar vendas:", error);
    res.status(500).json({ erro: "Erro ao listar vendas." });
  }
});

// DELETE /vendas/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Busca a venda junto com seus itens
    const venda = await prisma.venda.findUnique({
      where: { id: parseInt(id) },
      include: { itens: true },
    });

    if (!venda) {
      return res.status(404).json({ error: "Venda não encontrada." });
    }

    // Repor o estoque dos itens
    for (const item of venda.itens) {
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: {
          estoque: {
            increment: item.quantidade
          }
        }
      });
    }

    // Excluir itens relacionados
    await prisma.itemVenda.deleteMany({
      where: { vendaId: venda.id }
    });

    // Excluir a venda
    await prisma.venda.delete({
      where: { id: venda.id }
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
    // Busca venda e item
    const venda = await prisma.venda.findUnique({
      where: { id: parseInt(vendaId) },
      include: {
        itens: true
      }
    });

    if (!venda) {
      return res.status(404).json({ error: "Venda não encontrada." });
    }

    const item = venda.itens.find(i => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).json({ error: "Item da venda não encontrado." });
    }

    // Repor estoque da variação antiga
    await prisma.variacaoProduto.update({
      where: { id: item.variacaoProdutoId },
      data: {
        estoque: {
          increment: item.quantidade
        }
      }
    });

    // Verificar se existe estoque disponível na nova variação
    const variacaoNova = await prisma.variacaoProduto.findUnique({
      where: { id: novaVariacaoId }
    });

    if (!variacaoNova) {
      return res.status(400).json({ error: "Nova variação não encontrada." });
    }

    if (variacaoNova.estoque < item.quantidade) {
      return res.status(400).json({ error: "Estoque insuficiente para a nova variação." });
    }

    // Atualizar o item para a nova variação
    await prisma.itemVenda.update({
      where: { id: item.id },
      data: {
        variacaoProdutoId: novaVariacaoId
      }
    });

  const vendaAtualizada = await prisma.venda.findUnique({
  where: { id: venda.id },
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
    // Baixar o estoque da nova variação
    await prisma.variacaoProduto.update({
      where: { id: novaVariacaoId },
      data: {
        estoque: {
          decrement: item.quantidade
        }
      }
    });

    

    res.json({ mensagem: "Troca realizada com sucesso!" });
  } catch (error) {
    console.error("Erro ao realizar troca:", error);
    res.status(500).json({ error: "Erro ao realizar troca." });
  }
});



module.exports = router;
