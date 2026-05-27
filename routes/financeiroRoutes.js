const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

function numero(valor, fallback = 0) {
  if (typeof valor === "string") {
    const limpo = valor.trim();
    if (!limpo) return fallback;

    let normalizado = limpo.replace(/[^\d,.-]/g, "");
    const ultimaVirgula = normalizado.lastIndexOf(",");
    const ultimoPonto = normalizado.lastIndexOf(".");

    if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
      normalizado =
        ultimaVirgula > ultimoPonto
          ? normalizado.replace(/\./g, "").replace(",", ".")
          : normalizado.replace(/,/g, "");
    } else if (ultimaVirgula >= 0) {
      normalizado = normalizado.replace(",", ".");
    }

    const convertidoString = Number(normalizado);
    return Number.isFinite(convertidoString) ? convertidoString : fallback;
  }

  const convertido = Number(valor ?? fallback);
  return Number.isFinite(convertido) ? convertido : fallback;
}

function dinheiro(valor) {
  return Math.round((numero(valor) + Number.EPSILON) * 100) / 100;
}

function dataLocal(valor) {
  if (valor instanceof Date) return new Date(valor);

  const texto = String(valor || "").trim();
  const somenteData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (somenteData) {
    const [, ano, mes, dia] = somenteData;
    return new Date(Number(ano), Number(mes) - 1, Number(dia));
  }

  return new Date(valor);
}

function inicioDoDia(data) {
  const valor = dataLocal(data);
  valor.setHours(0, 0, 0, 0);
  return valor;
}

function fimDoDia(data) {
  const valor = dataLocal(data);
  valor.setHours(23, 59, 59, 999);
  return valor;
}

function periodoDaQuery(query) {
  const periodo = String(query.periodo || "mes");
  const hoje = new Date();

  if (periodo === "personalizado" && query.inicio && query.fim) {
    return {
      periodo,
      inicio: inicioDoDia(query.inicio),
      fim: fimDoDia(query.fim),
    };
  }

  if (periodo === "hoje") {
    return { periodo, inicio: inicioDoDia(hoje), fim: fimDoDia(hoje) };
  }

  if (periodo === "7dias") {
    const inicio = inicioDoDia(hoje);
    inicio.setDate(inicio.getDate() - 6);
    return { periodo, inicio, fim: fimDoDia(hoje) };
  }

  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { periodo: "mes", inicio: inicioDoDia(inicio), fim: fimDoDia(hoje) };
}

function custoDaVenda(venda) {
  return (venda.itens || []).reduce((total, item) => {
    const produto = item.variacaoProduto?.produto;
    const custo = numero(item.custoUnitario ?? produto?.custoUnitario) + numero(item.outrosCustos ?? produto?.outrosCustos);
    return total + custo * numero(item.quantidade);
  }, 0);
}

function calcularVendaFinanceiro(venda) {
  const subtotalItens = (venda.itens || []).reduce((total, item) => {
    const produto = item.variacaoProduto?.produto;
    const preco = numero(item.precoUnitario ?? produto?.preco);
    return total + preco * numero(item.quantidade);
  }, 0);
  const subtotalProdutos = numero(venda.subtotalProdutos ?? subtotalItens);
  const desconto = numero(venda.desconto);
  const taxaEntrega = numero(venda.taxaEntrega);
  const total = numero(venda.total);
  const receitaProdutos = Math.max(subtotalProdutos - desconto, 0);
  const custoProdutos = custoDaVenda(venda);

  return {
    total,
    subtotalProdutos,
    desconto,
    taxaEntrega,
    receitaProdutos,
    custoProdutos,
    lucroBruto: receitaProdutos - custoProdutos,
  };
}

function vendaComoLancamento(venda) {
  return {
    id: `venda-${venda.id}`,
    vendaId: venda.id,
    tipo: "entrada",
    origem: "venda",
    categoria: "venda",
    descricao: `Venda #${venda.id}`,
    valor: dinheiro(venda.total),
    formaPagamento: venda.formaPagamento,
    status: "pago",
    data: venda.data,
    vencimento: null,
    cliente: venda.cliente ? { id: venda.cliente.id, nome: venda.cliente.nome } : null,
    bloqueado: true,
  };
}

function statusAtual(lancamento) {
  if (lancamento.status !== "pendente") return lancamento.status;
  if (!lancamento.vencimento) return "pendente";
  return new Date(lancamento.vencimento).getTime() < inicioDoDia(new Date()).getTime() ? "vencido" : "pendente";
}

async function clienteDaLoja(clienteId, loja) {
  if (!clienteId) return null;
  const cliente = await prisma.cliente.findFirst({
    where: { id: Number(clienteId), lojaId: loja },
    select: { id: true },
  });
  if (!cliente) throw new Error("Cliente nao encontrado nesta loja.");
  return cliente.id;
}

router.get("/", requireRole("admin", "gerente"), async (req, res) => {
  const periodo = periodoDaQuery(req.query);

  try {
    const [vendas, lancamentos, contasReceber] = await Promise.all([
      prisma.venda.findMany({
        where: {
          lojaId: lojaId(req),
          data: { gte: periodo.inicio, lte: periodo.fim },
        },
        orderBy: { data: "desc" },
        include: {
          cliente: { select: { id: true, nome: true } },
          itens: {
            include: {
              variacaoProduto: {
                include: { produto: true },
              },
            },
          },
        },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: {
          lojaId: lojaId(req),
          status: { not: "cancelado" },
          data: { gte: periodo.inicio, lte: periodo.fim },
        },
        orderBy: { data: "desc" },
        include: { cliente: { select: { id: true, nome: true, telefone: true } } },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: {
          lojaId: lojaId(req),
          tipo: "entrada",
          status: "pendente",
          vencimento: { lte: periodo.fim },
        },
        orderBy: [{ vencimento: "asc" }, { data: "desc" }],
        include: { cliente: { select: { id: true, nome: true, telefone: true } } },
      }),
    ]);

    const vendasCalculadas = vendas.map((venda) => ({
      venda,
      valores: calcularVendaFinanceiro(venda),
    }));
    const faturamento = vendasCalculadas.reduce((total, item) => total + item.valores.total, 0);
    const receitaProdutos = vendasCalculadas.reduce((total, item) => total + item.valores.receitaProdutos, 0);
    const custoProdutos = vendasCalculadas.reduce((total, item) => total + item.valores.custoProdutos, 0);
    const entradasManuaisPagas = lancamentos
      .filter((item) => item.tipo === "entrada" && item.status === "pago")
      .reduce((total, item) => total + numero(item.valor), 0);
    const despesasPagas = lancamentos
      .filter((item) => item.tipo === "saida" && item.status === "pago")
      .reduce((total, item) => total + numero(item.valor), 0);
    const aReceber = contasReceber.reduce((total, item) => total + numero(item.valor), 0);

    const porPagamento = {};
    for (const venda of vendas) {
      const forma = venda.formaPagamento || "nao informado";
      porPagamento[forma] = numero(porPagamento[forma]) + numero(venda.total);
    }
    for (const lancamento of lancamentos) {
      if (lancamento.tipo !== "entrada" || lancamento.status !== "pago") continue;
      const forma = lancamento.formaPagamento || "nao informado";
      porPagamento[forma] = numero(porPagamento[forma]) + numero(lancamento.valor);
    }

    const porPagamentoNormalizado = Object.fromEntries(
      Object.entries(porPagamento).map(([forma, valor]) => [forma, dinheiro(valor)])
    );

    const lancamentosNormalizados = [
      ...vendas.map(vendaComoLancamento),
      ...lancamentos.map((item) => ({
        ...item,
        status: statusAtual(item),
        bloqueado: false,
      })),
    ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    res.json({
      periodo: {
        tipo: periodo.periodo,
        inicio: periodo.inicio,
        fim: periodo.fim,
      },
      resumo: {
        faturamento: dinheiro(faturamento),
        recebido: dinheiro(faturamento + entradasManuaisPagas),
        aReceber: dinheiro(aReceber),
        despesas: dinheiro(despesasPagas),
        receitaProdutos: dinheiro(receitaProdutos),
        custoProdutos: dinheiro(custoProdutos),
        lucroBruto: dinheiro(receitaProdutos - custoProdutos),
        saldoEstimado: dinheiro(faturamento + entradasManuaisPagas - despesasPagas),
        vendas: vendas.length,
        lancamentos: lancamentos.length,
      },
      porPagamento: porPagamentoNormalizado,
      contasReceber: contasReceber.map((item) => ({
        ...item,
        status: statusAtual(item),
      })),
      lancamentos: lancamentosNormalizados,
    });
  } catch (error) {
    console.error("Erro ao carregar financeiro:", error);
    res.status(500).json({ error: "Erro ao carregar financeiro." });
  }
});

router.post("/lancamentos", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const tipo = String(req.body.tipo || "").trim();
  const status = String(req.body.status || "pago").trim();
  const valor = numero(req.body.valor);
  const descricao = String(req.body.descricao || "").trim();
  const categoria = String(req.body.categoria || "").trim() || (tipo === "saida" ? "despesa" : "entrada");
  const formaPagamento = String(req.body.formaPagamento || "").trim() || null;

  if (!["entrada", "saida"].includes(tipo)) {
    return res.status(400).json({ error: "Tipo de lancamento invalido." });
  }

  if (!["pago", "pendente"].includes(status)) {
    return res.status(400).json({ error: "Status invalido." });
  }

  if (valor <= 0) {
    return res.status(400).json({ error: "Informe um valor maior que zero." });
  }

  if (!descricao) {
    return res.status(400).json({ error: "Informe uma descricao." });
  }

  try {
    const clienteId = await clienteDaLoja(req.body.clienteId, lojaId(req));
    const data = req.body.data ? dataLocal(req.body.data) : new Date();
    const vencimento = req.body.vencimento ? dataLocal(req.body.vencimento) : null;

    if (Number.isNaN(data.getTime())) {
      return res.status(400).json({ error: "Data invalida." });
    }

    if (vencimento && Number.isNaN(vencimento.getTime())) {
      return res.status(400).json({ error: "Vencimento invalido." });
    }

    const lancamento = await prisma.lancamentoFinanceiro.create({
      data: {
        lojaId: lojaId(req),
        clienteId,
        tipo,
        origem: "manual",
        categoria,
        descricao,
        valor,
        formaPagamento,
        status,
        data,
        vencimento,
        pagoEm: status === "pago" ? new Date() : null,
      },
      include: { cliente: { select: { id: true, nome: true, telefone: true } } },
    });

    res.status(201).json(lancamento);
  } catch (error) {
    console.error("Erro ao criar lancamento financeiro:", error);
    res.status(400).json({ error: error.message || "Erro ao criar lancamento." });
  }
});

router.patch("/lancamentos/:id/pagar", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const lancamento = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req), origem: "manual" },
    });

    if (!lancamento) return res.status(404).json({ error: "Lancamento nao encontrado." });

    const atualizado = await prisma.lancamentoFinanceiro.update({
      where: { id: lancamento.id },
      data: {
        status: "pago",
        pagoEm: new Date(),
        formaPagamento: req.body.formaPagamento || lancamento.formaPagamento,
      },
      include: { cliente: { select: { id: true, nome: true, telefone: true } } },
    });

    res.json(atualizado);
  } catch (error) {
    console.error("Erro ao marcar lancamento como pago:", error);
    res.status(400).json({ error: "Erro ao marcar como pago." });
  }
});

router.delete("/lancamentos/:id", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const lancamento = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req), origem: "manual" },
    });

    if (!lancamento) return res.status(404).json({ error: "Lancamento nao encontrado." });

    await prisma.lancamentoFinanceiro.update({
      where: { id: lancamento.id },
      data: { status: "cancelado" },
    });

    res.json({ mensagem: "Lancamento removido." });
  } catch (error) {
    console.error("Erro ao remover lancamento:", error);
    res.status(400).json({ error: "Erro ao remover lancamento." });
  }
});

module.exports = router;
