function digitoEan13(corpo) {
  const soma = corpo
    .split("")
    .reduce((total, digito, index) => total + Number(digito) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (soma % 10)) % 10);
}

function gerarCodigoBarras(lojaId, variacaoId) {
  const loja = String(Number(lojaId) || 0).padStart(3, "0").slice(-3);
  const variacao = String(Number(variacaoId) || 0).padStart(7, "0").slice(-7);
  const corpo = `20${loja}${variacao}`;
  return `${corpo}${digitoEan13(corpo)}`;
}

async function garantirCodigosVariacoes(tx, lojaId, variacoes) {
  const atualizadas = [];

  for (const variacao of variacoes) {
    if (variacao.codigoBarras) {
      atualizadas.push(variacao);
      continue;
    }

    const codigoBarras = gerarCodigoBarras(lojaId, variacao.id);
    atualizadas.push(
      await tx.variacaoProduto.update({
        where: { id: variacao.id },
        data: { codigoBarras },
      })
    );
  }

  return atualizadas;
}

module.exports = {
  gerarCodigoBarras,
  garantirCodigosVariacoes,
};
