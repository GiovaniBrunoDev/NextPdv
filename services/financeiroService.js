const FORMAS = {
  DINHEIRO: "dinheiro",
  PIX: "pix",
  DEBITO: "debito",
  CREDITO: "credito",
  PRAZO: "a_prazo",
};

const CONTAS_PADRAO = [
  { nome: "Caixa fisico", tipo: "caixa" },
  { nome: "Pix", tipo: "pix" },
  { nome: "Banco", tipo: "banco" },
  { nome: "Maquininha", tipo: "maquininha" },
  { nome: "A receber", tipo: "receber" },
];

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

    const convertido = Number(normalizado);
    return Number.isFinite(convertido) ? convertido : fallback;
  }

  const convertido = Number(valor ?? fallback);
  return Number.isFinite(convertido) ? convertido : fallback;
}

function dinheiro(valor) {
  return Math.round((numero(valor) + Number.EPSILON) * 100) / 100;
}

function normalizarForma(forma) {
  const texto = String(forma || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  if (["dinheiro", "cash"].includes(texto)) return FORMAS.DINHEIRO;
  if (["pix"].includes(texto)) return FORMAS.PIX;
  if (["debito", "cartao_debito", "cartao_de_debito"].includes(texto)) return FORMAS.DEBITO;
  if (["credito", "cartao", "cartao_credito", "cartao_de_credito"].includes(texto)) return FORMAS.CREDITO;
  if (["a_prazo", "prazo", "crediario", "fiado"].includes(texto)) return FORMAS.PRAZO;
  return texto || FORMAS.DINHEIRO;
}

function labelForma(forma) {
  const normalizada = normalizarForma(forma);
  const labels = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    debito: "Debito",
    credito: "Credito",
    a_prazo: "A prazo",
  };
  return labels[normalizada] || normalizada;
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
  const valor = dataLocal(data || new Date());
  valor.setHours(0, 0, 0, 0);
  return valor;
}

function fimDoDia(data) {
  const valor = dataLocal(data || new Date());
  valor.setHours(23, 59, 59, 999);
  return valor;
}

function adicionarDias(data, dias) {
  const valor = new Date(data);
  valor.setDate(valor.getDate() + Number(dias || 0));
  return valor;
}

function ultimoDiaMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function dataComDia(ano, mes, dia) {
  return new Date(ano, mes, Math.min(Number(dia || 1), ultimoDiaMes(ano, mes)));
}

function adicionarMeses(data, meses, diaPreferido = data.getDate()) {
  const base = new Date(data);
  return dataComDia(base.getFullYear(), base.getMonth() + Number(meses || 0), diaPreferido);
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

function statusAtual(lancamento) {
  if (lancamento.status !== "pendente") return lancamento.status;
  if (!lancamento.vencimento) return "pendente";
  return new Date(lancamento.vencimento).getTime() < inicioDoDia(new Date()).getTime() ? "vencido" : "pendente";
}

function primeiraContaPorTipo(contas, tipo) {
  return contas.find((conta) => conta.tipo === tipo && conta.ativo) || contas.find((conta) => conta.tipo === tipo);
}

function contasPadraoPorTipo(contas) {
  return {
    caixa: primeiraContaPorTipo(contas, "caixa"),
    pix: primeiraContaPorTipo(contas, "pix"),
    banco: primeiraContaPorTipo(contas, "banco"),
    maquininha: primeiraContaPorTipo(contas, "maquininha"),
    receber: primeiraContaPorTipo(contas, "receber"),
  };
}

async function garantirEstruturaFinanceira(client, lojaId) {
  await client.contaFinanceira.createMany({
    data: CONTAS_PADRAO.map((conta) => ({ ...conta, lojaId, padrao: true })),
    skipDuplicates: true,
  });

  const contas = await client.contaFinanceira.findMany({
    where: { lojaId },
    orderBy: [{ padrao: "desc" }, { id: "asc" }],
  });
  const padrao = contasPadraoPorTipo(contas);

  let configuracao = await client.configuracaoFinanceira.findUnique({ where: { lojaId } });
  const defaults = {
    contaDinheiroId: padrao.caixa?.id || null,
    contaPixId: padrao.pix?.id || null,
    contaDebitoId: padrao.maquininha?.id || padrao.banco?.id || null,
    contaCreditoId: padrao.maquininha?.id || padrao.banco?.id || null,
    contaPrazoId: padrao.receber?.id || null,
  };

  if (!configuracao) {
    configuracao = await client.configuracaoFinanceira.create({
      data: { lojaId, ...defaults },
    });
  } else {
    const faltantes = {};
    for (const [campo, valor] of Object.entries(defaults)) {
      if (!configuracao[campo] && valor) faltantes[campo] = valor;
    }
    if (Object.keys(faltantes).length) {
      configuracao = await client.configuracaoFinanceira.update({
        where: { lojaId },
        data: faltantes,
      });
    }
  }

  return { contas, configuracao };
}

function contaIdParaForma(forma, contas, configuracao) {
  const normalizada = normalizarForma(forma);
  const padrao = contasPadraoPorTipo(contas);
  const porForma = {
    dinheiro: configuracao?.contaDinheiroId || padrao.caixa?.id,
    pix: configuracao?.contaPixId || padrao.pix?.id,
    debito: configuracao?.contaDebitoId || padrao.maquininha?.id || padrao.banco?.id,
    credito: configuracao?.contaCreditoId || padrao.maquininha?.id || padrao.banco?.id,
    a_prazo: configuracao?.contaPrazoId || padrao.receber?.id,
  };
  return porForma[normalizada] || padrao.banco?.id || contas[0]?.id || null;
}

function taxaForma(forma, configuracao) {
  const normalizada = normalizarForma(forma);
  if (normalizada === FORMAS.DEBITO) return numero(configuracao?.taxaDebito);
  if (normalizada === FORMAS.CREDITO) return numero(configuracao?.taxaCredito);
  return 0;
}

function prazoForma(forma, configuracao) {
  const normalizada = normalizarForma(forma);
  if (normalizada === FORMAS.DEBITO) return Number(configuracao?.prazoDebitoDias || 0);
  if (normalizada === FORMAS.CREDITO) return Number(configuracao?.prazoCreditoDias || 0);
  return 0;
}

function normalizarPagamentosVenda({ pagamentos, total, formaPagamento, clienteId, configuracao }) {
  const valorTotal = dinheiro(total);
  const lista = Array.isArray(pagamentos) && pagamentos.length
    ? pagamentos
    : [{ forma: formaPagamento || FORMAS.DINHEIRO, valor: valorTotal, parcelas: 1 }];

  const normalizados = lista
    .map((pagamento) => {
      const forma = normalizarForma(pagamento.forma || pagamento.formaPagamento);
      const valorBruto = dinheiro(pagamento.valorBruto ?? pagamento.valor ?? pagamento.total);
      const parcelas = Math.max(1, Math.floor(numero(pagamento.parcelas, 1)));
      return { forma, valorBruto, parcelas };
    })
    .filter((pagamento) => pagamento.valorBruto > 0);

  if (!normalizados.length && valorTotal > 0) {
    throw new Error("Informe ao menos uma forma de pagamento.");
  }

  const soma = dinheiro(normalizados.reduce((totalPagamentos, pagamento) => totalPagamentos + pagamento.valorBruto, 0));
  if (Math.abs(soma - valorTotal) > 0.02) {
    throw new Error("A soma dos pagamentos precisa fechar com o total da venda.");
  }

  const prazo = normalizados.find((pagamento) => pagamento.forma === FORMAS.PRAZO);
  if (prazo && !clienteId) {
    throw new Error("Venda a prazo precisa ter cliente selecionado.");
  }

  const maxParcelas = Math.max(1, Number(configuracao?.parcelasCreditoMax || 6));
  for (const pagamento of normalizados) {
    if (pagamento.forma === FORMAS.CREDITO && pagamento.parcelas > maxParcelas) {
      throw new Error(`Parcelamento maximo permitido: ${maxParcelas}x.`);
    }
    if (pagamento.forma !== FORMAS.CREDITO && pagamento.parcelas > 1) {
      pagamento.parcelas = 1;
    }
  }

  return normalizados;
}

function montarParcelasPagamento(pagamento, configuracao, dataVenda) {
  const percentualTaxa = taxaForma(pagamento.forma, configuracao);
  const valorTaxaTotal = dinheiro((pagamento.valorBruto * percentualTaxa) / 100);
  const valorLiquidoTotal = dinheiro(pagamento.valorBruto - valorTaxaTotal);
  const parcelas = pagamento.forma === FORMAS.CREDITO ? pagamento.parcelas : 1;
  const vencimentoBase = adicionarDias(dataVenda, prazoForma(pagamento.forma, configuracao));
  const statusImediato = [FORMAS.DINHEIRO, FORMAS.PIX].includes(pagamento.forma);

  const resultado = [];
  let brutoRestante = pagamento.valorBruto;
  let taxaRestante = valorTaxaTotal;
  let liquidoRestante = valorLiquidoTotal;

  for (let parcela = 1; parcela <= parcelas; parcela += 1) {
    const ultima = parcela === parcelas;
    const valorBruto = ultima ? dinheiro(brutoRestante) : dinheiro(pagamento.valorBruto / parcelas);
    const valorTaxa = ultima ? dinheiro(taxaRestante) : dinheiro(valorTaxaTotal / parcelas);
    const valorLiquido = ultima ? dinheiro(liquidoRestante) : dinheiro(valorLiquidoTotal / parcelas);
    const vencimento =
      pagamento.forma === FORMAS.CREDITO
        ? adicionarMeses(vencimentoBase, parcela - 1, vencimentoBase.getDate())
        : vencimentoBase;
    const vencimentoHojeOuPassado = fimDoDia(vencimento).getTime() <= fimDoDia(new Date()).getTime();
    const status = statusImediato || (pagamento.forma !== FORMAS.PRAZO && vencimentoHojeOuPassado) ? "pago" : "pendente";

    resultado.push({
      parcelaNumero: parcela,
      parcelasTotal: parcelas,
      valorBruto,
      valorTaxa,
      valorLiquido,
      vencimento,
      status,
    });

    brutoRestante -= valorBruto;
    taxaRestante -= valorTaxa;
    liquidoRestante -= valorLiquido;
  }

  return {
    valorTaxaTotal,
    valorLiquidoTotal,
    parcelas: resultado,
  };
}

function descricaoPagamento(vendaId, forma, parcela) {
  const base = `Venda #${vendaId} - ${labelForma(forma)}`;
  if (parcela.parcelasTotal > 1) return `${base} ${parcela.parcelaNumero}/${parcela.parcelasTotal}`;
  return base;
}

function formaPagamentoResumo(pagamentos) {
  const formas = [...new Set(pagamentos.map((pagamento) => labelForma(pagamento.forma)))];
  return formas.join(" + ");
}

async function registrarFinanceiroVenda(tx, { lojaId, usuarioId, venda, pagamentos, formaPagamento }) {
  const { contas, configuracao } = await garantirEstruturaFinanceira(tx, lojaId);
  const normalizados = normalizarPagamentosVenda({
    pagamentos,
    total: venda.total,
    formaPagamento,
    clienteId: venda.clienteId,
    configuracao,
  });
  const dataVenda = venda.data || new Date();

  await tx.lancamentoFinanceiro.deleteMany({ where: { lojaId, vendaId: venda.id, origem: "venda" } });
  await tx.vendaPagamento.deleteMany({ where: { lojaId, vendaId: venda.id } });

  const pagamentosCriados = [];
  for (const pagamento of normalizados) {
    const contaId = contaIdParaForma(pagamento.forma, contas, configuracao);
    const calculo = montarParcelasPagamento(pagamento, configuracao, dataVenda);
    const statusPagamento = calculo.parcelas.every((parcela) => parcela.status === "pago") ? "pago" : "pendente";

    const vendaPagamento = await tx.vendaPagamento.create({
      data: {
        lojaId,
        vendaId: venda.id,
        contaId,
        forma: pagamento.forma,
        valorBruto: pagamento.valorBruto,
        valorTaxa: calculo.valorTaxaTotal,
        valorLiquido: calculo.valorLiquidoTotal,
        parcelas: pagamento.parcelas,
        status: statusPagamento,
        vencimento: calculo.parcelas[0]?.vencimento || null,
      },
    });

    for (const parcela of calculo.parcelas) {
      await tx.lancamentoFinanceiro.create({
        data: {
          lojaId,
          contaId,
          vendaId: venda.id,
          vendaPagamentoId: vendaPagamento.id,
          clienteId: venda.clienteId || null,
          criadoPorId: usuarioId || null,
          tipo: "entrada",
          origem: "venda",
          categoria: pagamento.forma === FORMAS.PRAZO ? "a_receber" : "venda",
          descricao: descricaoPagamento(venda.id, pagamento.forma, parcela),
          valor: parcela.valorLiquido,
          valorBruto: parcela.valorBruto,
          valorTaxa: parcela.valorTaxa,
          valorLiquido: parcela.valorLiquido,
          formaPagamento: pagamento.forma,
          parcelaNumero: parcela.parcelaNumero,
          parcelasTotal: parcela.parcelasTotal,
          status: parcela.status,
          data: dataVenda,
          vencimento: parcela.vencimento,
          pagoEm: parcela.status === "pago" ? dataVenda : null,
        },
      });
    }

    pagamentosCriados.push(vendaPagamento);
  }

  await tx.venda.update({
    where: { id: venda.id },
    data: { formaPagamento: formaPagamentoResumo(normalizados) },
  });

  return pagamentosCriados;
}

async function gerarDespesasRecorrentes(client, lojaId, ate = new Date()) {
  const recorrencias = await client.despesaRecorrente.findMany({
    where: {
      lojaId,
      ativo: true,
      proximaGeracao: { lte: fimDoDia(ate) },
    },
  });

  for (const recorrencia of recorrencias) {
    let vencimento = inicioDoDia(recorrencia.proximaGeracao);
    let guard = 0;

    while (vencimento.getTime() <= fimDoDia(ate).getTime() && guard < 24) {
      const existente = await client.lancamentoFinanceiro.findFirst({
        where: {
          lojaId,
          recorrenciaId: recorrencia.id,
          vencimento: { gte: inicioDoDia(vencimento), lte: fimDoDia(vencimento) },
          status: { not: "cancelado" },
        },
        select: { id: true },
      });

      if (!existente) {
        await client.lancamentoFinanceiro.create({
          data: {
            lojaId,
            contaId: recorrencia.contaId,
            recorrenciaId: recorrencia.id,
            tipo: "saida",
            origem: "recorrente",
            categoria: recorrencia.categoria,
            descricao: recorrencia.descricao,
            valor: dinheiro(recorrencia.valor),
            valorBruto: dinheiro(recorrencia.valor),
            valorTaxa: 0,
            valorLiquido: dinheiro(recorrencia.valor),
            formaPagamento: recorrencia.formaPagamento,
            status: "pendente",
            data: vencimento,
            vencimento,
          },
        });
      }

      vencimento = adicionarMeses(vencimento, 1, recorrencia.diaVencimento);
      guard += 1;
    }

    await client.despesaRecorrente.update({
      where: { id: recorrencia.id },
      data: { proximaGeracao: vencimento },
    });
  }
}

function calcularSaldoConta(conta, lancamentos) {
  const saldo = lancamentos.reduce((total, lancamento) => {
    if (lancamento.contaId !== conta.id || lancamento.status !== "pago") return total;
    const valor = numero(lancamento.valorLiquido ?? lancamento.valor);
    return lancamento.tipo === "saida" ? total - valor : total + valor;
  }, numero(conta.saldoInicial));

  return dinheiro(saldo);
}

module.exports = {
  FORMAS,
  CONTAS_PADRAO,
  adicionarMeses,
  calcularSaldoConta,
  contaIdParaForma,
  dataLocal,
  dinheiro,
  fimDoDia,
  formaPagamentoResumo,
  garantirEstruturaFinanceira,
  gerarDespesasRecorrentes,
  inicioDoDia,
  labelForma,
  normalizarForma,
  numero,
  periodoDaQuery,
  registrarFinanceiroVenda,
  statusAtual,
};
