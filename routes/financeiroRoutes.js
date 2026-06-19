const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const {
  adicionarMeses,
  calcularSaldoConta,
  dataLocal,
  dinheiro,
  fimDoDia,
  garantirEstruturaFinanceira,
  gerarDespesasRecorrentes,
  inicioDoDia,
  labelForma,
  numero,
  periodoDaQuery,
  statusAtual,
} = require("../services/financeiroService");

const router = express.Router();
const prisma = new PrismaClient();
const acessoFinanceiro = requireRole("admin", "gerente", "vendedor");

function lojaId(req) {
  return req.loja.id;
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
    id: venda.id,
    data: venda.data,
    cliente: venda.cliente?.nome || "Sem cliente",
    total: dinheiro(total),
    subtotalProdutos: dinheiro(subtotalProdutos),
    desconto: dinheiro(desconto),
    taxaEntrega: dinheiro(taxaEntrega),
    receitaProdutos: dinheiro(receitaProdutos),
    custoProdutos: dinheiro(custoProdutos),
    lucroBruto: dinheiro(receitaProdutos - custoProdutos),
  };
}

function lancamentoNoPeriodo(lancamento, periodo) {
  const data = new Date(lancamento.pagoEm || lancamento.data);
  return data >= periodo.inicio && data <= periodo.fim;
}

function vencimentoAte(lancamento, data) {
  if (!lancamento.vencimento) return true;
  return new Date(lancamento.vencimento).getTime() <= fimDoDia(data).getTime();
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

async function contaDaLoja(client, contaId, loja) {
  if (!contaId) return null;
  const conta = await client.contaFinanceira.findFirst({
    where: { id: Number(contaId), lojaId: loja, ativo: true },
    select: { id: true },
  });
  if (!conta) throw new Error("Conta financeira nao encontrada nesta loja.");
  return conta.id;
}

function proximaDataRecorrente(diaVencimento) {
  const hoje = new Date();
  const dia = Math.min(Math.max(Number(diaVencimento || 1), 1), 31);
  let data = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (fimDoDia(data).getTime() < inicioDoDia(hoje).getTime()) {
    data = adicionarMeses(data, 1, dia);
  }
  return data;
}

router.get("/", acessoFinanceiro, async (req, res) => {
  const periodo = periodoDaQuery(req.query);

  try {
    await gerarDespesasRecorrentes(prisma, lojaId(req), periodo.fim);
    const { contas, configuracao } = await garantirEstruturaFinanceira(prisma, lojaId(req));

    const [
      vendas,
      lancamentosPeriodo,
      lancamentosSaldo,
      recebiveis,
      despesas,
      recorrentes,
      pagamentos,
    ] = await Promise.all([
      prisma.venda.findMany({
        where: {
          lojaId: lojaId(req),
          data: { gte: periodo.inicio, lte: periodo.fim },
        },
        orderBy: { data: "desc" },
        include: {
          cliente: { select: { id: true, nome: true } },
          itens: { include: { variacaoProduto: { include: { produto: true } } } },
          pagamentos: true,
        },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: {
          lojaId: lojaId(req),
          status: { not: "cancelado" },
          OR: [
            { data: { gte: periodo.inicio, lte: periodo.fim } },
            { vencimento: { gte: periodo.inicio, lte: periodo.fim } },
            { pagoEm: { gte: periodo.inicio, lte: periodo.fim } },
          ],
        },
        orderBy: [{ data: "desc" }, { id: "desc" }],
        include: {
          conta: true,
          cliente: { select: { id: true, nome: true, telefone: true } },
          criadoPor: { select: { id: true, nome: true } },
        },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: { lojaId: lojaId(req), status: "pago" },
        include: { conta: true },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: {
          lojaId: lojaId(req),
          tipo: "entrada",
          status: "pendente",
          origem: { in: ["venda", "manual"] },
        },
        orderBy: [{ vencimento: "asc" }, { data: "desc" }],
        include: {
          conta: true,
          cliente: { select: { id: true, nome: true, telefone: true } },
        },
      }),
      prisma.lancamentoFinanceiro.findMany({
        where: {
          lojaId: lojaId(req),
          tipo: "saida",
          status: { in: ["pendente", "pago"] },
        },
        orderBy: [{ vencimento: "asc" }, { data: "desc" }],
        include: { conta: true, recorrencia: true },
      }),
      prisma.despesaRecorrente.findMany({
        where: { lojaId: lojaId(req), ativo: true },
        orderBy: [{ proximaGeracao: "asc" }, { descricao: "asc" }],
        include: { conta: true },
      }),
      prisma.vendaPagamento.findMany({
        where: {
          lojaId: lojaId(req),
          venda: { data: { gte: periodo.inicio, lte: periodo.fim } },
        },
      }),
    ]);

    const vendasCalculadas = vendas.map(calcularVendaFinanceiro);
    const faturamento = vendasCalculadas.reduce((total, venda) => total + venda.total, 0);
    const receitaProdutos = vendasCalculadas.reduce((total, venda) => total + venda.receitaProdutos, 0);
    const custoProdutos = vendasCalculadas.reduce((total, venda) => total + venda.custoProdutos, 0);

    const lancamentosNormalizados = lancamentosPeriodo.map((item) => ({
      ...item,
      status: statusAtual(item),
    }));

    const entradasPagas = lancamentosNormalizados
      .filter((item) => item.tipo === "entrada" && item.status === "pago" && lancamentoNoPeriodo(item, periodo))
      .reduce((total, item) => total + numero(item.valorLiquido ?? item.valor), 0);
    const despesasPagas = lancamentosNormalizados
      .filter((item) => item.tipo === "saida" && item.status === "pago" && lancamentoNoPeriodo(item, periodo))
      .reduce((total, item) => total + numero(item.valorLiquido ?? item.valor), 0);
    const aReceber = recebiveis
      .filter((item) => vencimentoAte(item, periodo.fim))
      .reduce((total, item) => total + numero(item.valorLiquido ?? item.valor), 0);
    const contasPagar = despesas
      .filter((item) => statusAtual(item) !== "pago" && vencimentoAte(item, periodo.fim))
      .reduce((total, item) => total + numero(item.valorLiquido ?? item.valor), 0);

    const contasComSaldo = contas.map((conta) => ({
      ...conta,
      saldo: calcularSaldoConta(conta, lancamentosSaldo),
    }));
    const saldoTotal = contasComSaldo.reduce((total, conta) => total + numero(conta.saldo), 0);

    const porPagamento = {};
    for (const pagamento of pagamentos) {
      const forma = pagamento.forma || "nao informado";
      if (!porPagamento[forma]) {
        porPagamento[forma] = { forma, label: labelForma(forma), bruto: 0, taxas: 0, liquido: 0, vendas: 0 };
      }
      porPagamento[forma].bruto += numero(pagamento.valorBruto);
      porPagamento[forma].taxas += numero(pagamento.valorTaxa);
      porPagamento[forma].liquido += numero(pagamento.valorLiquido);
      porPagamento[forma].vendas += 1;
    }

    const caixaReferenciaInformada = req.query.caixaData ? dataLocal(req.query.caixaData) : new Date();
    const caixaReferencia = Number.isNaN(caixaReferenciaInformada.getTime()) ? new Date() : caixaReferenciaInformada;
    const caixaInicio = inicioDoDia(caixaReferencia);
    const caixaFim = fimDoDia(caixaReferencia);
    const contaCaixa = contasComSaldo.find((conta) => conta.tipo === "caixa");
    const movimentosCaixaHoje = lancamentosNormalizados.filter((item) => {
      const data = new Date(item.data);
      return item.contaId === contaCaixa?.id && data >= caixaInicio && data <= caixaFim;
    });
    const caixaHoje = {
      data: caixaInicio,
      conta: contaCaixa || null,
      entradas: dinheiro(
        movimentosCaixaHoje.filter((item) => item.tipo === "entrada" && item.status === "pago").reduce((total, item) => total + numero(item.valor), 0)
      ),
      saidas: dinheiro(
        movimentosCaixaHoje.filter((item) => item.tipo === "saida" && item.status === "pago").reduce((total, item) => total + numero(item.valor), 0)
      ),
      movimentos: movimentosCaixaHoje,
    };
    caixaHoje.saldoDia = dinheiro(caixaHoje.entradas - caixaHoje.saidas);

    res.json({
      periodo: { tipo: periodo.periodo, inicio: periodo.inicio, fim: periodo.fim },
      configuracao,
      contas: contasComSaldo,
      resumo: {
        faturamento: dinheiro(faturamento),
        recebido: dinheiro(entradasPagas),
        aReceber: dinheiro(aReceber),
        despesas: dinheiro(despesasPagas),
        contasPagar: dinheiro(contasPagar),
        receitaProdutos: dinheiro(receitaProdutos),
        custoProdutos: dinheiro(custoProdutos),
        lucroBruto: dinheiro(receitaProdutos - custoProdutos),
        saldoTotal: dinheiro(saldoTotal),
        vendas: vendas.length,
        ticketMedio: dinheiro(vendas.length ? faturamento / vendas.length : 0),
      },
      porPagamento: Object.values(porPagamento).map((item) => ({
        ...item,
        bruto: dinheiro(item.bruto),
        taxas: dinheiro(item.taxas),
        liquido: dinheiro(item.liquido),
      })),
      caixaHoje,
      contasReceber: recebiveis.map((item) => ({ ...item, status: statusAtual(item) })),
      despesas: despesas.map((item) => ({ ...item, status: statusAtual(item) })),
      recorrentes,
      lancamentos: lancamentosNormalizados,
      vendas: vendasCalculadas,
    });
  } catch (error) {
    console.error("Erro ao carregar financeiro:", error);
    res.status(500).json({ error: "Erro ao carregar financeiro." });
  }
});

router.put("/configuracao", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  try {
    await garantirEstruturaFinanceira(prisma, lojaId(req));
    const data = {
      taxaDebito: Math.max(numero(req.body.taxaDebito), 0),
      prazoDebitoDias: Math.max(Math.floor(numero(req.body.prazoDebitoDias)), 0),
      taxaCredito: Math.max(numero(req.body.taxaCredito), 0),
      prazoCreditoDias: Math.max(Math.floor(numero(req.body.prazoCreditoDias)), 0),
      parcelasCreditoMax: Math.max(Math.floor(numero(req.body.parcelasCreditoMax, 1)), 1),
      contaDinheiroId: req.body.contaDinheiroId ? await contaDaLoja(prisma, req.body.contaDinheiroId, lojaId(req)) : null,
      contaPixId: req.body.contaPixId ? await contaDaLoja(prisma, req.body.contaPixId, lojaId(req)) : null,
      contaDebitoId: req.body.contaDebitoId ? await contaDaLoja(prisma, req.body.contaDebitoId, lojaId(req)) : null,
      contaCreditoId: req.body.contaCreditoId ? await contaDaLoja(prisma, req.body.contaCreditoId, lojaId(req)) : null,
      contaPrazoId: req.body.contaPrazoId ? await contaDaLoja(prisma, req.body.contaPrazoId, lojaId(req)) : null,
    };

    const configuracao = await prisma.configuracaoFinanceira.update({
      where: { lojaId: lojaId(req) },
      data,
    });

    res.json(configuracao);
  } catch (error) {
    console.error("Erro ao salvar configuracao financeira:", error);
    res.status(400).json({ error: error.message || "Erro ao salvar configuracao financeira." });
  }
});

router.post("/contas", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const tipo = String(req.body.tipo || "banco").trim();
  const saldoInicial = numero(req.body.saldoInicial);

  if (!nome) return res.status(400).json({ error: "Informe o nome da conta." });

  try {
    const conta = await prisma.contaFinanceira.create({
      data: {
        lojaId: lojaId(req),
        nome,
        tipo,
        saldoInicial,
      },
    });
    res.status(201).json(conta);
  } catch (error) {
    console.error("Erro ao criar conta financeira:", error);
    res.status(400).json({ error: "Erro ao criar conta financeira." });
  }
});

router.patch("/contas/:id", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  try {
    const conta = await prisma.contaFinanceira.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req) },
    });
    if (!conta) return res.status(404).json({ error: "Conta nao encontrada." });

    const atualizada = await prisma.contaFinanceira.update({
      where: { id: conta.id },
      data: {
        nome: req.body.nome === undefined ? conta.nome : String(req.body.nome || "").trim() || conta.nome,
        tipo: req.body.tipo === undefined ? conta.tipo : String(req.body.tipo || conta.tipo).trim(),
        saldoInicial: req.body.saldoInicial === undefined ? conta.saldoInicial : numero(req.body.saldoInicial),
        ativo: req.body.ativo === undefined ? conta.ativo : Boolean(req.body.ativo),
      },
    });

    res.json(atualizada);
  } catch (error) {
    console.error("Erro ao atualizar conta:", error);
    res.status(400).json({ error: "Erro ao atualizar conta." });
  }
});

router.post("/lancamentos", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  const tipo = String(req.body.tipo || "").trim();
  const status = String(req.body.status || "pago").trim();
  const valor = dinheiro(req.body.valor);
  const descricao = String(req.body.descricao || "").trim();
  const categoria = String(req.body.categoria || "").trim() || (tipo === "saida" ? "despesa" : "entrada");
  const formaPagamento = String(req.body.formaPagamento || "").trim() || null;

  if (!["entrada", "saida"].includes(tipo)) return res.status(400).json({ error: "Tipo de lancamento invalido." });
  if (!["pago", "pendente"].includes(status)) return res.status(400).json({ error: "Status invalido." });
  if (valor <= 0) return res.status(400).json({ error: "Informe um valor maior que zero." });
  if (!descricao) return res.status(400).json({ error: "Informe uma descricao." });

  try {
    await garantirEstruturaFinanceira(prisma, lojaId(req));
    const clienteId = await clienteDaLoja(req.body.clienteId, lojaId(req));
    const contaId = await contaDaLoja(prisma, req.body.contaId, lojaId(req));
    const data = req.body.data ? dataLocal(req.body.data) : new Date();
    const vencimento = req.body.vencimento ? dataLocal(req.body.vencimento) : null;

    if (Number.isNaN(data.getTime())) return res.status(400).json({ error: "Data invalida." });
    if (vencimento && Number.isNaN(vencimento.getTime())) return res.status(400).json({ error: "Vencimento invalido." });

    const lancamento = await prisma.lancamentoFinanceiro.create({
      data: {
        lojaId: lojaId(req),
        contaId,
        clienteId,
        criadoPorId: req.usuario?.id || null,
        tipo,
        origem: "manual",
        categoria,
        descricao,
        valor,
        valorBruto: valor,
        valorTaxa: 0,
        valorLiquido: valor,
        formaPagamento,
        status,
        data,
        vencimento,
        pagoEm: status === "pago" ? new Date() : null,
        observacao: String(req.body.observacao || "").trim() || null,
      },
      include: { conta: true, cliente: { select: { id: true, nome: true, telefone: true } } },
    });

    res.status(201).json(lancamento);
  } catch (error) {
    console.error("Erro ao criar lancamento financeiro:", error);
    res.status(400).json({ error: error.message || "Erro ao criar lancamento." });
  }
});

router.patch("/lancamentos/:id/pagar", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  try {
    const lancamento = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req), status: { not: "cancelado" } },
    });
    if (!lancamento) return res.status(404).json({ error: "Lancamento nao encontrado." });

    const contaId = req.body.contaId ? await contaDaLoja(prisma, req.body.contaId, lojaId(req)) : lancamento.contaId;
    const atualizado = await prisma.lancamentoFinanceiro.update({
      where: { id: lancamento.id },
      data: {
        contaId,
        status: "pago",
        pagoEm: new Date(),
        formaPagamento: req.body.formaPagamento || lancamento.formaPagamento,
      },
      include: { conta: true, cliente: { select: { id: true, nome: true, telefone: true } } },
    });

    res.json(atualizado);
  } catch (error) {
    console.error("Erro ao marcar lancamento como pago:", error);
    res.status(400).json({ error: "Erro ao marcar como pago." });
  }
});

router.delete("/lancamentos/:id", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  try {
    const lancamento = await prisma.lancamentoFinanceiro.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req), origem: { in: ["manual", "recorrente"] } },
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

router.post("/transferencias", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  const valor = dinheiro(req.body.valor);
  const descricao = String(req.body.descricao || "Transferencia entre contas").trim();

  if (valor <= 0) return res.status(400).json({ error: "Informe um valor maior que zero." });
  if (!req.body.contaOrigemId || !req.body.contaDestinoId) return res.status(400).json({ error: "Informe as contas da transferencia." });
  if (Number(req.body.contaOrigemId) === Number(req.body.contaDestinoId)) return res.status(400).json({ error: "As contas precisam ser diferentes." });

  try {
    const contaOrigemId = await contaDaLoja(prisma, req.body.contaOrigemId, lojaId(req));
    const contaDestinoId = await contaDaLoja(prisma, req.body.contaDestinoId, lojaId(req));
    const data = req.body.data ? dataLocal(req.body.data) : new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      const comum = {
        lojaId: lojaId(req),
        criadoPorId: req.usuario?.id || null,
        origem: "transferencia",
        categoria: "transferencia",
        formaPagamento: "transferencia",
        status: "pago",
        data,
        pagoEm: data,
      };

      const saida = await tx.lancamentoFinanceiro.create({
        data: {
          ...comum,
          contaId: contaOrigemId,
          tipo: "saida",
          descricao,
          valor,
          valorBruto: valor,
          valorTaxa: 0,
          valorLiquido: valor,
        },
      });
      const entrada = await tx.lancamentoFinanceiro.create({
        data: {
          ...comum,
          contaId: contaDestinoId,
          tipo: "entrada",
          descricao,
          valor,
          valorBruto: valor,
          valorTaxa: 0,
          valorLiquido: valor,
        },
      });

      return { saida, entrada };
    });

    res.status(201).json(resultado);
  } catch (error) {
    console.error("Erro ao transferir:", error);
    res.status(400).json({ error: error.message || "Erro ao transferir." });
  }
});

router.post("/recorrentes", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  const descricao = String(req.body.descricao || "").trim();
  const categoria = String(req.body.categoria || "despesa").trim();
  const valor = dinheiro(req.body.valor);
  const diaVencimento = Math.min(Math.max(Math.floor(numero(req.body.diaVencimento, 1)), 1), 31);

  if (!descricao) return res.status(400).json({ error: "Informe a descricao da recorrencia." });
  if (valor <= 0) return res.status(400).json({ error: "Informe um valor maior que zero." });

  try {
    const contaId = await contaDaLoja(prisma, req.body.contaId, lojaId(req));
    const recorrencia = await prisma.despesaRecorrente.create({
      data: {
        lojaId: lojaId(req),
        contaId,
        descricao,
        categoria,
        valor,
        formaPagamento: String(req.body.formaPagamento || "").trim() || null,
        diaVencimento,
        proximaGeracao: proximaDataRecorrente(diaVencimento),
      },
      include: { conta: true },
    });

    res.status(201).json(recorrencia);
  } catch (error) {
    console.error("Erro ao criar recorrencia:", error);
    res.status(400).json({ error: error.message || "Erro ao criar recorrencia." });
  }
});

router.patch("/recorrentes/:id", assinaturaAtivaRequired, acessoFinanceiro, async (req, res) => {
  try {
    const recorrencia = await prisma.despesaRecorrente.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req) },
    });
    if (!recorrencia) return res.status(404).json({ error: "Recorrencia nao encontrada." });

    const atualizada = await prisma.despesaRecorrente.update({
      where: { id: recorrencia.id },
      data: {
        ativo: req.body.ativo === undefined ? recorrencia.ativo : Boolean(req.body.ativo),
      },
    });

    res.json(atualizada);
  } catch (error) {
    console.error("Erro ao atualizar recorrencia:", error);
    res.status(400).json({ error: "Erro ao atualizar recorrencia." });
  }
});

module.exports = router;
