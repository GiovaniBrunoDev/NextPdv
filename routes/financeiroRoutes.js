const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

function numero(valor, fallback = 0) {
  const convertido = Number(valor ?? fallback);
  return Number.isFinite(convertido) ? convertido : fallback;
}

function inicioDoDia(data) {
  const valor = new Date(data);
  valor.setHours(0, 0, 0, 0);
  return valor;
}

function fimDoDia(data) {
  const valor = new Date(data);
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
    const custo = numero(item.custoUnitario) + numero(item.outrosCustos);
    return total + custo * numero(item.quantidade);
  }, 0);
}

function nomeCliente(cliente) {
  return cliente?.nome || "Cliente nao informado";
}

function vendaComoLancamento(venda) {
  return {
    id: `venda-${venda.id}`,
    vendaId: venda.id,
    tipo: "entrada",
    origem: "venda",
    categoria: "venda",
    descricao: `Venda #${venda.id}`,
    valor: numero(venda.total),
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
          itens: true,
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

    const faturamento = vendas.reduce((total, venda) => total + numero(venda.total), 0);
    const custoProdutos = vendas.reduce((total, venda) => total + custoDaVenda(venda), 0);
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
        faturamento,
        recebido: faturamento + entradasManuaisPagas,
        aReceber,
        despesas: despesasPagas,
        custoProdutos,
        lucroBruto: faturamento - custoProdutos,
        saldoEstimado: faturamento + entradasManuaisPagas - despesasPagas,
        vendas: vendas.length,
        lancamentos: lancamentos.length,
      },
      porPagamento,
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
    const data = req.body.data ? new Date(req.body.data) : new Date();
    const vencimento = req.body.vencimento ? new Date(req.body.vencimento) : null;

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
