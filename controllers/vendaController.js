const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function registrarVenda(req, res) {
  const {
    produtos,         // [{ variacaoProdutoId: 1, quantidade: 2 }, ...]
    total,
    formaPagamento,
    tipoEntrega,
    taxaEntrega,
    entregador,
    clienteId
  } = req.body;

  if (!produtos || produtos.length === 0) {
    return res.status(400).json({ error: "Nenhum produto informado." });
  }

  try {
    const novaVenda = await prisma.venda.create({
      data: {
        total,
        formaPagamento,
        tipoEntrega,
        taxaEntrega,
        entregador,
        clienteId,
      }
    });

    for (const item of produtos) {
      // Criar item da venda
      await prisma.itemVenda.create({
        data: {
          vendaId: novaVenda.id,
          variacaoProdutoId: item.variacaoProdutoId,
          quantidade: item.quantidade
        }
      });

      // Baixar o estoque da variação
      await prisma.variacaoProduto.update({
        where: { id: item.variacaoProdutoId },
        data: {
          estoque: {
            decrement: item.quantidade
          }
        }
      });
    }

    res.status(201).json({ mensagem: "Venda registrada com sucesso!", id: novaVenda.id });
  } catch (error) {
    console.error("Erro ao registrar venda:", error);
    res.status(500).json({ error: "Erro ao registrar venda." });
  }
}



module.exports = { registrarVenda, deletarVenda, prisma };
