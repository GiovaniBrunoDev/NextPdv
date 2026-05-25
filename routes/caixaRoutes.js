const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { calcularResumoCaixa, numero } = require("../services/caixaService");

const router = express.Router();
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

const caixaInclude = {
  abertoPor: { select: { id: true, nome: true } },
  fechadoPor: { select: { id: true, nome: true } },
  movimentos: {
    orderBy: { criadoEm: "desc" },
    include: {
      criadoPor: { select: { id: true, nome: true } },
      venda: { select: { id: true, data: true, total: true, formaPagamento: true } },
    },
  },
};

async function estadoCaixa(client, loja) {
  const caixa = await client.caixa.findFirst({
    where: { lojaId: loja, status: "aberto" },
    orderBy: { abertoEm: "desc" },
    include: caixaInclude,
  });

  const historico = await client.caixa.findMany({
    where: { lojaId: loja, status: "fechado" },
    orderBy: { fechadoEm: "desc" },
    take: 8,
    include: {
      abertoPor: { select: { id: true, nome: true } },
      fechadoPor: { select: { id: true, nome: true } },
    },
  });

  return {
    caixa,
    resumo: calcularResumoCaixa(caixa),
    historico,
  };
}

router.get("/atual", requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    res.json(await estadoCaixa(prisma, lojaId(req)));
  } catch (error) {
    console.error("Erro ao carregar caixa:", error);
    res.status(500).json({ error: "Erro ao carregar caixa." });
  }
});

router.post("/abrir", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  const valorInicial = numero(req.body.valorInicial);
  const observacaoAbertura = String(req.body.observacao || "").trim() || null;

  if (valorInicial < 0) {
    return res.status(400).json({ error: "Valor inicial invalido." });
  }

  try {
    const resposta = await prisma.$transaction(async (tx) => {
      const aberto = await tx.caixa.findFirst({
        where: { lojaId: lojaId(req), status: "aberto" },
        select: { id: true },
      });
      if (aberto) throw new Error("Ja existe um caixa aberto para esta loja.");

      await tx.caixa.create({
        data: {
          lojaId: lojaId(req),
          abertoPorId: req.usuario?.id || null,
          valorInicial,
          observacaoAbertura,
        },
      });

      return estadoCaixa(tx, lojaId(req));
    });

    res.status(201).json(resposta);
  } catch (error) {
    console.error("Erro ao abrir caixa:", error);
    res.status(400).json({ error: error.message || "Erro ao abrir caixa." });
  }
});

router.post("/movimentos", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  const tipo = String(req.body.tipo || "").trim();
  const valor = numero(req.body.valor);
  const descricao = String(req.body.descricao || "").trim();
  const formaPagamento = String(req.body.formaPagamento || "").trim() || null;

  if (!["entrada", "saida"].includes(tipo)) {
    return res.status(400).json({ error: "Tipo de movimento invalido." });
  }

  if (valor <= 0) {
    return res.status(400).json({ error: "Informe um valor maior que zero." });
  }

  if (!descricao) {
    return res.status(400).json({ error: "Informe uma descricao para o movimento." });
  }

  try {
    const resposta = await prisma.$transaction(async (tx) => {
      const caixa = await tx.caixa.findFirst({
        where: { lojaId: lojaId(req), status: "aberto" },
        orderBy: { abertoEm: "desc" },
      });
      if (!caixa) throw new Error("Abra o caixa antes de lancar movimentos.");

      await tx.movimentoCaixa.create({
        data: {
          lojaId: lojaId(req),
          caixaId: caixa.id,
          criadoPorId: req.usuario?.id || null,
          tipo,
          descricao,
          valor,
          formaPagamento,
        },
      });

      return estadoCaixa(tx, lojaId(req));
    });

    res.status(201).json(resposta);
  } catch (error) {
    console.error("Erro ao lancar movimento:", error);
    res.status(400).json({ error: error.message || "Erro ao lancar movimento." });
  }
});

router.post("/fechar", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  const valorFinalInformado = numero(req.body.valorFinalInformado);
  const observacaoFechamento = String(req.body.observacao || "").trim() || null;

  if (valorFinalInformado < 0) {
    return res.status(400).json({ error: "Valor contado invalido." });
  }

  try {
    const resposta = await prisma.$transaction(async (tx) => {
      const caixa = await tx.caixa.findFirst({
        where: { lojaId: lojaId(req), status: "aberto" },
        orderBy: { abertoEm: "desc" },
        include: { movimentos: true },
      });
      if (!caixa) throw new Error("Nenhum caixa aberto para fechar.");

      const resumo = calcularResumoCaixa(caixa);
      await tx.caixa.update({
        where: { id: caixa.id },
        data: {
          status: "fechado",
          fechadoPorId: req.usuario?.id || null,
          fechadoEm: new Date(),
          valorFinalInformado,
          valorFinalCalculado: resumo.saldoEsperado,
          diferenca: valorFinalInformado - resumo.saldoEsperado,
          observacaoFechamento,
        },
      });

      return estadoCaixa(tx, lojaId(req));
    });

    res.json(resposta);
  } catch (error) {
    console.error("Erro ao fechar caixa:", error);
    res.status(400).json({ error: error.message || "Erro ao fechar caixa." });
  }
});

module.exports = router;
