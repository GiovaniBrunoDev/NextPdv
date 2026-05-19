const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

const entradaInclude = {
  variacaoProduto: {
    include: {
      produto: true,
    },
  },
};

router.get("/entradas", async (req, res) => {
  const limite = Math.min(Number(req.query.limite || 50), 200);

  try {
    const entradas = await prisma.entradaEstoque.findMany({
      take: limite,
      orderBy: { criadoEm: "desc" },
      include: entradaInclude,
    });

    res.json(entradas);
  } catch (error) {
    console.error("Erro ao listar entradas de estoque:", error);
    res.status(500).json({ error: "Erro ao listar entradas de estoque." });
  }
});

router.post("/entradas", async (req, res) => {
  const {
    variacaoProdutoId,
    quantidade,
    custoUnitario,
    outrosCustos,
    fornecedor,
    observacao,
    atualizarCustosProduto,
  } = req.body;

  const variacaoId = Number(variacaoProdutoId);
  const quantidadeEntrada = Number(quantidade);

  if (!variacaoId || !Number.isInteger(quantidadeEntrada) || quantidadeEntrada <= 0) {
    return res.status(400).json({ error: "Informe uma variação e uma quantidade válida." });
  }

  try {
    const entrada = await prisma.$transaction(async (tx) => {
      const variacao = await tx.variacaoProduto.findUnique({
        where: { id: variacaoId },
        include: { produto: true },
      });

      if (!variacao) throw new Error("Variação não encontrada.");

      const custo = custoUnitario === "" || custoUnitario === undefined ? null : Number(custoUnitario);
      const outros = outrosCustos === "" || outrosCustos === undefined ? null : Number(outrosCustos);

      await tx.variacaoProduto.update({
        where: { id: variacaoId },
        data: {
          estoque: {
            increment: quantidadeEntrada,
          },
        },
      });

      if (atualizarCustosProduto) {
        const dataProduto = {};
        if (custo !== null && !Number.isNaN(custo)) dataProduto.custoUnitario = custo;
        if (outros !== null && !Number.isNaN(outros)) dataProduto.outrosCustos = outros;

        if (Object.keys(dataProduto).length > 0) {
          await tx.produto.update({
            where: { id: variacao.produtoId },
            data: dataProduto,
          });
        }
      }

      return tx.entradaEstoque.create({
        data: {
          variacaoProdutoId: variacaoId,
          quantidade: quantidadeEntrada,
          custoUnitario: custo,
          outrosCustos: outros,
          fornecedor: fornecedor?.trim() || null,
          observacao: observacao?.trim() || null,
        },
        include: entradaInclude,
      });
    });

    res.status(201).json(entrada);
  } catch (error) {
    console.error("Erro ao registrar entrada de estoque:", error);
    res.status(400).json({ error: error.message || "Erro ao registrar entrada de estoque." });
  }
});

module.exports = router;
