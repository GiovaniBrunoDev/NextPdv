function numero(valor, fallback = 0) {
  const parsed = Number(valor ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
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

async function registrarVendaNoCaixa(tx, { lojaId, usuarioId, vendaId, total, formaPagamento }) {
  const caixa = await buscarCaixaAberto(tx, lojaId);
  if (!caixa) return null;

  return tx.movimentoCaixa.create({
    data: {
      lojaId,
      caixaId: caixa.id,
      vendaId,
      criadoPorId: usuarioId || null,
      tipo: "venda",
      descricao: `Venda #${vendaId}`,
      valor: numero(total),
      formaPagamento: formaPagamento || null,
    },
  });
}

module.exports = {
  calcularResumoCaixa,
  registrarVendaNoCaixa,
  buscarCaixaAberto,
  numero,
};
