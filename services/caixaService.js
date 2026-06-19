const { FORMAS, normalizarForma } = require("./financeiroService");

function numero(valor, fallback = 0) {
  const parsed = Number(valor ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inicioDoDia(data = new Date()) {
  const valor = new Date(data);
  valor.setHours(0, 0, 0, 0);
  return valor;
}

function fimDoDia(data = new Date()) {
  const valor = new Date(data);
  valor.setHours(23, 59, 59, 999);
  return valor;
}

function calcularResumoCaixa(caixa) {
  if (!caixa) {
    return {
      valorInicial: 0,
      vendas: 0,
      entradas: 0,
      saidas: 0,
      saldoEsperado: 0,
      quantidadeVendas: 0,
      porPagamento: {},
    };
  }

  const resumo = {
    valorInicial: numero(caixa.valorInicial),
    vendas: 0,
    entradas: 0,
    saidas: 0,
    saldoEsperado: numero(caixa.valorInicial),
    quantidadeVendas: 0,
    porPagamento: {},
  };

  for (const movimento of caixa.movimentos || []) {
    const valor = numero(movimento.valor);

    if (movimento.tipo === "saida") {
      resumo.saidas += valor;
      resumo.saldoEsperado -= valor;
      continue;
    }

    if (movimento.tipo === "venda") {
      resumo.vendas += valor;
      resumo.quantidadeVendas += 1;
      const forma = movimento.formaPagamento || "nao informado";
      resumo.porPagamento[forma] = (resumo.porPagamento[forma] || 0) + valor;
    } else {
      resumo.entradas += valor;
    }

    resumo.saldoEsperado += valor;
  }

  return resumo;
}

async function buscarCaixaAberto(tx, lojaId) {
  return tx.caixa.findFirst({
    where: { lojaId, status: "aberto" },
    orderBy: { abertoEm: "desc" },
  });
}

async function buscarOuCriarCaixaDoDia(tx, lojaId, usuarioId) {
  const hoje = new Date();
  const caixa = await tx.caixa.findFirst({
    where: {
      lojaId,
      status: "aberto",
      abertoEm: { gte: inicioDoDia(hoje), lte: fimDoDia(hoje) },
    },
    orderBy: { abertoEm: "desc" },
  });

  if (caixa) return caixa;

  return tx.caixa.create({
    data: {
      lojaId,
      abertoPorId: usuarioId || null,
      valorInicial: 0,
      observacaoAbertura: "Caixa automatico do dia.",
    },
  });
}

function valorDinheiroDaVenda(total, formaPagamento, pagamentos) {
  if (Array.isArray(pagamentos) && pagamentos.length) {
    return pagamentos.reduce((soma, pagamento) => {
      const forma = normalizarForma(pagamento.forma || pagamento.formaPagamento);
      if (forma !== FORMAS.DINHEIRO) return soma;
      return soma + numero(pagamento.valorBruto ?? pagamento.valor ?? pagamento.total);
    }, 0);
  }

  return normalizarForma(formaPagamento) === FORMAS.DINHEIRO ? numero(total) : 0;
}

async function registrarVendaNoCaixa(tx, { lojaId, usuarioId, vendaId, total, formaPagamento, pagamentos }) {
  const valorDinheiro = valorDinheiroDaVenda(total, formaPagamento, pagamentos);
  if (valorDinheiro <= 0) return null;

  const caixa = await buscarOuCriarCaixaDoDia(tx, lojaId, usuarioId);

  return tx.movimentoCaixa.create({
    data: {
      lojaId,
      caixaId: caixa.id,
      vendaId,
      criadoPorId: usuarioId || null,
      tipo: "venda",
      descricao: `Venda #${vendaId}`,
      valor: numero(valorDinheiro),
      formaPagamento: FORMAS.DINHEIRO,
    },
  });
}

module.exports = {
  calcularResumoCaixa,
  registrarVendaNoCaixa,
  buscarCaixaAberto,
  buscarOuCriarCaixaDoDia,
  numero,
};
