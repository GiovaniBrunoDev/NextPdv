const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { registrarMovimentoEstoque, registrarMovimentosEstoque } = require("../services/estoqueMovimentoService");
const { mensagemPublica } = require("../services/errorResponse");
const { garantirCodigosVariacoes } = require("../services/codigoBarrasService");

const router = express.Router();
const prisma = new PrismaClient();

const entradaInclude = {
  variacaoProduto: {
    include: {
      produto: true,
    },
  },
};

const movimentoInclude = {
  variacaoProduto: {
    include: {
      produto: {
        select: {
          id: true,
          nome: true,
          imagemUrl: true,
        },
      },
    },
  },
  criadoPor: {
    select: {
      id: true,
      nome: true,
    },
  },
};

const transacaoEstoqueOpcoes = {
  maxWait: 15000,
  timeout: 60000,
};

function lojaId(req) {
  return req.loja.id;
}

function numeroFormulario(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const normalizado = typeof valor === "string" ? valor.replace(",", ".") : valor;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function custosDaEntrada(custoUnitario, outrosCustos) {
  const custo = numeroFormulario(custoUnitario);
  const outros = numeroFormulario(outrosCustos);

  if (custoUnitario !== "" && custoUnitario !== undefined && custoUnitario !== null && custo === null) {
    throw new Error("Informe um custo unitario valido.");
  }

  if (outrosCustos !== "" && outrosCustos !== undefined && outrosCustos !== null && outros === null) {
    throw new Error("Informe outros custos corretamente.");
  }

  if (custo !== null && custo < 0) throw new Error("O custo unitario nao pode ser negativo.");
  if (outros !== null && outros < 0) throw new Error("Outros custos nao podem ser negativos.");

  return { custo, outros };
}

router.get("/entradas", async (req, res) => {
  const limite = Math.min(Number(req.query.limite || 50), 200);

  try {
    const entradas = await prisma.entradaEstoque.findMany({
      where: { lojaId: lojaId(req) },
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

router.get("/movimentos", async (req, res) => {
  const limite = Math.min(Number(req.query.limite || 80), 200);

  try {
    const movimentos = await prisma.movimentoEstoque.findMany({
      where: { lojaId: lojaId(req) },
      take: limite,
      orderBy: { criadoEm: "desc" },
      include: movimentoInclude,
    });

    res.json(movimentos);
  } catch (error) {
    console.error("Erro ao listar movimentos de estoque:", error);
    res.status(500).json({ error: "Erro ao carregar o historico de estoque." });
  }
});

router.post("/codigos-barras/gerar", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { produto: { lojaId: lojaId(req) } },
      select: { id: true, codigoBarras: true },
    });

    const semCodigo = variacoes.filter((variacao) => !variacao.codigoBarras);
    if (semCodigo.length) {
      await prisma.$transaction(
        (tx) => garantirCodigosVariacoes(tx, lojaId(req), semCodigo),
        transacaoEstoqueOpcoes
      );
    }

    res.json({
      mensagem: semCodigo.length ? "Codigos de barras gerados com sucesso." : "Todos os itens ja possuem codigo de barras.",
      gerados: semCodigo.length,
      total: variacoes.length,
    });
  } catch (error) {
    console.error("Erro ao gerar codigos de barras:", error);
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel gerar os codigos de barras.") });
  }
});

router.post("/entradas", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const { variacaoProdutoId, quantidade, custoUnitario, outrosCustos, fornecedor, observacao, atualizarCustosProduto } = req.body;
  const variacaoId = Number(variacaoProdutoId);
  const quantidadeEntrada = Number(quantidade);

  if (!variacaoId || !Number.isInteger(quantidadeEntrada) || quantidadeEntrada <= 0) {
    return res.status(400).json({ error: "Informe uma variacao e uma quantidade valida." });
  }

  try {
    const lojaAtualId = lojaId(req);
    const entradaCriada = await prisma.$transaction(async (tx) => {
      const variacao = await tx.variacaoProduto.findFirst({
        where: { id: variacaoId, produto: { lojaId: lojaAtualId } },
        include: { produto: true },
      });
      if (!variacao) throw new Error("Variacao nao encontrada.");

      const { custo, outros } = custosDaEntrada(custoUnitario, outrosCustos);

      const variacaoAtualizada = await tx.variacaoProduto.update({
        where: { id: variacaoId },
        data: { estoque: { increment: quantidadeEntrada } },
      });

      if (atualizarCustosProduto) {
        const dataProduto = {};
        if (custo !== null && !Number.isNaN(custo)) dataProduto.custoUnitario = custo;
        if (outros !== null && !Number.isNaN(outros)) dataProduto.outrosCustos = outros;
        if (Object.keys(dataProduto).length > 0) {
          await tx.produto.update({ where: { id: variacao.produtoId }, data: dataProduto });
        }
      }

      const entrada = await tx.entradaEstoque.create({
        data: {
          lojaId: lojaAtualId,
          variacaoProdutoId: variacaoId,
          quantidade: quantidadeEntrada,
          custoUnitario: custo,
          outrosCustos: outros,
          fornecedor: fornecedor?.trim() || null,
          observacao: observacao?.trim() || null,
        },
      });

      await registrarMovimentoEstoque(tx, {
        lojaId: lojaAtualId,
        variacaoProdutoId: variacaoId,
        usuarioId: req.usuario?.id,
        tipo: "reposicao",
        quantidade: quantidadeEntrada,
        saldoAnterior: variacao.estoque,
        saldoFinal: variacaoAtualizada.estoque,
        origemTipo: "entrada",
        origemId: entrada.id,
        observacao,
      });

      return entrada;
    }, transacaoEstoqueOpcoes);

    const entrada = await prisma.entradaEstoque.findFirst({
      where: { id: entradaCriada.id, lojaId: lojaAtualId },
      include: entradaInclude,
    });

    res.status(201).json(entrada);
  } catch (error) {
    console.error("Erro ao registrar entrada de estoque:", error);
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel registrar a entrada de estoque.") });
  }
});

router.post("/entradas/grade", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const { produtoId, itens, custoUnitario, outrosCustos, fornecedor, observacao, atualizarCustosProduto } = req.body;
  const produtoIdNumerico = Number(produtoId);
  const itensNormalizados = Array.isArray(itens)
    ? itens
        .map((item) => ({
          numeracao: String(item.numeracao || "").trim(),
          quantidade: Number(item.quantidade || 0),
          variacaoProdutoId: item.variacaoProdutoId ? Number(item.variacaoProdutoId) : null,
        }))
        .filter((item) => item.numeracao && Number.isInteger(item.quantidade) && item.quantidade > 0)
    : [];

  const itensValidos = Object.values(
    itensNormalizados.reduce((acc, item) => {
      const chave = item.numeracao;
      if (!acc[chave]) acc[chave] = { ...item };
      else acc[chave].quantidade += item.quantidade;
      return acc;
    }, {})
  );

  if (!produtoIdNumerico || itensValidos.length === 0) {
    return res.status(400).json({ error: "Informe o produto e ao menos uma numeracao com quantidade." });
  }

  try {
    const lojaAtualId = lojaId(req);
    const entradasCriadas = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id: produtoIdNumerico, lojaId: lojaAtualId },
        include: { variacoes: true },
      });
      if (!produto) throw new Error("Produto nao encontrado.");

      const { custo, outros } = custosDaEntrada(custoUnitario, outrosCustos);

      if (atualizarCustosProduto) {
        const dataProduto = {};
        if (custo !== null && !Number.isNaN(custo)) dataProduto.custoUnitario = custo;
        if (outros !== null && !Number.isNaN(outros)) dataProduto.outrosCustos = outros;
        if (Object.keys(dataProduto).length > 0) {
          await tx.produto.update({ where: { id: produtoIdNumerico }, data: dataProduto });
        }
      }

      const variacoesPorNumeracao = new Map(
        produto.variacoes.map((variacao) => [String(variacao.numeracao), variacao])
      );
      const entradasCriadas = [];
      const movimentos = [];

      for (const item of itensValidos) {
        let variacao = item.variacaoProdutoId
          ? produto.variacoes.find((variacaoProduto) => variacaoProduto.id === item.variacaoProdutoId) || null
          : null;

        if (!variacao) {
          variacao = variacoesPorNumeracao.get(item.numeracao) || null;
        }

        if (!variacao) {
          variacao = await tx.variacaoProduto.create({
            data: { produtoId: produtoIdNumerico, numeracao: item.numeracao, estoque: 0 },
          });
          variacoesPorNumeracao.set(String(variacao.numeracao), variacao);
        }

        const variacaoAtualizada = await tx.variacaoProduto.update({
          where: { id: variacao.id },
          data: { estoque: { increment: item.quantidade } },
        });

        const entrada = await tx.entradaEstoque.create({
          data: {
            lojaId: lojaAtualId,
            variacaoProdutoId: variacao.id,
            quantidade: item.quantidade,
            custoUnitario: custo,
            outrosCustos: outros,
            fornecedor: fornecedor?.trim() || null,
            observacao: observacao?.trim() || null,
          },
        });
        entradasCriadas.push(entrada);
        movimentos.push({
          lojaId: lojaAtualId,
          variacaoProdutoId: variacao.id,
          usuarioId: req.usuario?.id,
          tipo: "reposicao",
          quantidade: item.quantidade,
          saldoAnterior: variacao.estoque,
          saldoFinal: variacaoAtualizada.estoque,
          origemTipo: "entrada",
          origemId: entrada.id,
          observacao,
        });
        variacao.estoque = variacaoAtualizada.estoque;
      }

      await registrarMovimentosEstoque(tx, movimentos);
      return entradasCriadas;
    }, transacaoEstoqueOpcoes);

    const entradas = await prisma.entradaEstoque.findMany({
      where: {
        lojaId: lojaAtualId,
        id: { in: entradasCriadas.map((entrada) => entrada.id) },
      },
      orderBy: { criadoEm: "desc" },
      include: entradaInclude,
    });

    res.status(201).json({ mensagem: "Entrada por grade registrada com sucesso.", entradas });
  } catch (error) {
    console.error("Erro ao registrar entrada por grade:", error);
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel registrar a reposicao. Tente novamente.") });
  }
});

module.exports = router;
