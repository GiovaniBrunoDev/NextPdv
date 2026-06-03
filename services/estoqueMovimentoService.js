async function registrarMovimentoEstoque(tx, {
  lojaId,
  variacaoProdutoId,
  usuarioId,
  tipo,
  quantidade,
  saldoAnterior,
  saldoFinal,
  origemTipo,
  origemId,
  observacao,
}) {
  return tx.movimentoEstoque.create({
    data: {
      lojaId,
      variacaoProdutoId,
      criadoPorId: usuarioId || null,
      tipo,
      quantidade,
      saldoAnterior,
      saldoFinal,
      origemTipo: origemTipo || null,
      origemId: origemId || null,
      observacao: observacao?.trim() || null,
    },
  });
}

async function registrarMovimentosEstoque(tx, movimentos) {
  if (!movimentos.length) return;

  return tx.movimentoEstoque.createMany({
    data: movimentos.map((movimento) => ({
      lojaId: movimento.lojaId,
      variacaoProdutoId: movimento.variacaoProdutoId,
      criadoPorId: movimento.usuarioId || null,
      tipo: movimento.tipo,
      quantidade: movimento.quantidade,
      saldoAnterior: movimento.saldoAnterior,
      saldoFinal: movimento.saldoFinal,
      origemTipo: movimento.origemTipo || null,
      origemId: movimento.origemId || null,
      observacao: movimento.observacao?.trim() || null,
    })),
  });
}

module.exports = {
  registrarMovimentoEstoque,
  registrarMovimentosEstoque,
};
