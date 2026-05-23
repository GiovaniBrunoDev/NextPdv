const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

function intervaloPorPeriodo(periodo, inicio, fim) {
  if (inicio || fim) {
    return {
      gte: inicio ? new Date(`${inicio}T00:00:00`) : undefined,
      lte: fim ? new Date(`${fim}T23:59:59.999`) : undefined,
    };
  }

  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  if (periodo === "dia") return { gte: inicioHoje };

  if (periodo === "7dias") {
    const seteDias = new Date(inicioHoje);
    seteDias.setDate(seteDias.getDate() - 6);
    return { gte: seteDias };
  }

  if (periodo === "mes") {
    return { gte: new Date(agora.getFullYear(), agora.getMonth(), 1) };
  }

  return undefined;
}

function calcularVenda(venda) {
  const taxaEntrega = Number(venda.taxaEntrega || 0);
  const desconto = Number(venda.desconto || 0);
  const subtotalItens = venda.itens.reduce((soma, item) => {
    const produto = item.variacaoProduto?.produto;
    const preco = Number(item.precoUnitario ?? produto?.preco ?? 0);
    return soma + preco * item.quantidade;
  }, 0);
  const subtotalProdutos = Number(venda.subtotalProdutos ?? subtotalItens);
  const receitaProdutos = Math.max(subtotalProdutos - desconto, 0);

  const custoProdutos = venda.itens.reduce((soma, item) => {
    const produto = item.variacaoProduto?.produto;
    const custoUnitario = Number(item.custoUnitario ?? produto?.custoUnitario ?? 0);
    const outrosCustos = Number(item.outrosCustos ?? produto?.outrosCustos ?? 0);
    return soma + (custoUnitario + outrosCustos) * item.quantidade;
  }, 0);

  const lucro = receitaProdutos - custoProdutos;

  return {
    id: venda.id,
    data: venda.data,
    cliente: venda.cliente?.nome || "Sem cliente",
    total: Number(venda.total || 0),
    subtotalProdutos,
    desconto,
    taxaEntrega,
    receitaProdutos,
    custoProdutos,
    lucro,
    margem: receitaProdutos > 0 ? (lucro / receitaProdutos) * 100 : 0,
  };
}

router.get("/lucro", requireRole("admin", "gerente"), async (req, res) => {
  const { periodo = "mes", inicio, fim } = req.query;

  try {
    const data = intervaloPorPeriodo(periodo, inicio, fim);
    const vendas = await prisma.venda.findMany({
      where: {
        lojaId: req.loja.id,
        ...(data ? { data } : {}),
      },
      orderBy: { data: "desc" },
      include: {
        cliente: { select: { nome: true } },
        itens: {
          include: {
            variacaoProduto: {
              include: { produto: true },
            },
          },
        },
      },
    });

    const vendasCalculadas = vendas.map(calcularVenda);
    const resumo = vendasCalculadas.reduce(
      (acc, venda) => {
        acc.vendas += 1;
        acc.faturamento += venda.total;
        acc.subtotalProdutos += venda.subtotalProdutos;
        acc.descontos += venda.desconto;
        acc.taxasEntrega += venda.taxaEntrega;
        acc.receitaProdutos += venda.receitaProdutos;
        acc.custoProdutos += venda.custoProdutos;
        acc.lucro += venda.lucro;
        return acc;
      },
      {
        vendas: 0,
        faturamento: 0,
        subtotalProdutos: 0,
        descontos: 0,
        taxasEntrega: 0,
        receitaProdutos: 0,
        custoProdutos: 0,
        lucro: 0,
      }
    );

    resumo.margem = resumo.receitaProdutos > 0 ? (resumo.lucro / resumo.receitaProdutos) * 100 : 0;

    const porDia = Object.values(
      vendasCalculadas.reduce((acc, venda) => {
        const dia = new Date(venda.data).toLocaleDateString("pt-BR");
        if (!acc[dia]) acc[dia] = { dia, receitaProdutos: 0, custoProdutos: 0, lucro: 0 };
        acc[dia].receitaProdutos += venda.receitaProdutos;
        acc[dia].custoProdutos += venda.custoProdutos;
        acc[dia].lucro += venda.lucro;
        return acc;
      }, {})
    ).sort((a, b) => {
      const [da, ma, ya] = a.dia.split("/");
      const [db, mb, yb] = b.dia.split("/");
      return new Date(`${ya}-${ma}-${da}`) - new Date(`${yb}-${mb}-${db}`);
    });

    res.json({ resumo, porDia, vendas: vendasCalculadas });
  } catch (error) {
    console.error("Erro ao gerar relatório de lucro:", error);
    res.status(500).json({ error: "Erro ao gerar relatório de lucro." });
  }
});

module.exports = router;
