const express = require("express");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { authRequired, requireSuperadmin, assinaturaOperacionalAtiva } = require("../middlewares/auth");
const { slugify } = require("../utils/slug");

const router = express.Router();
const prisma = new PrismaClient();

router.use(authRequired, requireSuperadmin);

router.get("/lojas", async (req, res) => {
  const lojas = await prisma.loja.findMany({
    orderBy: { criadaEm: "desc" },
    include: {
      assinatura: { include: { plano: true } },
      membros: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
    },
  });

  res.json(
    lojas.map((loja) => ({
      ...loja,
      assinaturaAtiva: assinaturaOperacionalAtiva(loja.assinatura),
    }))
  );
});

router.put("/lojas/:id", async (req, res) => {
  const { nome, ativa } = req.body;
  const loja = await prisma.loja.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(nome !== undefined ? { nome } : {}),
      ...(ativa !== undefined ? { ativa: Boolean(ativa) } : {}),
    },
    include: { assinatura: { include: { plano: true } } },
  });
  res.json(loja);
});

router.get("/planos", async (req, res) => {
  const planos = await prisma.plano.findMany({ orderBy: { id: "asc" } });
  res.json(planos);
});

router.post("/planos", async (req, res) => {
  const { nome, valorMensal, descricao, ativo = true } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome do plano obrigatorio." });

  const plano = await prisma.plano.create({
    data: {
      nome,
      valorMensal: Number(valorMensal || 0),
      descricao: descricao || null,
      ativo: Boolean(ativo),
    },
  });
  res.status(201).json(plano);
});

router.put("/planos/:id", async (req, res) => {
  const { nome, valorMensal, descricao, ativo } = req.body;
  const plano = await prisma.plano.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(nome !== undefined ? { nome } : {}),
      ...(valorMensal !== undefined ? { valorMensal: Number(valorMensal || 0) } : {}),
      ...(descricao !== undefined ? { descricao: descricao || null } : {}),
      ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
    },
  });
  res.json(plano);
});

router.post("/convites", async (req, res) => {
  const { email, nomeLoja, planoId, papel = "admin", diasExpiracao = 7 } = req.body;
  if (!nomeLoja) return res.status(400).json({ error: "Nome da loja obrigatorio." });

  const token = crypto.randomBytes(24).toString("hex");
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + Number(diasExpiracao || 7));

  const convite = await prisma.conviteLoja.create({
    data: {
      token,
      email: email ? String(email).toLowerCase().trim() : null,
      nomeLoja,
      slugLoja: slugify(nomeLoja),
      planoId: planoId ? Number(planoId) : null,
      papel,
      criadoPorId: req.usuario.id,
      expiraEm,
    },
    include: { plano: true },
  });

  res.status(201).json({
    ...convite,
    link: `${process.env.FRONTEND_URL || "http://localhost:3000"}/convite/${convite.token}`,
  });
});

router.get("/convites", async (req, res) => {
  const convites = await prisma.conviteLoja.findMany({
    orderBy: { criadoEm: "desc" },
    include: { plano: true, loja: true },
  });
  res.json(
    convites.map((convite) => ({
      ...convite,
      link: `${process.env.FRONTEND_URL || "http://localhost:3000"}/convite/${convite.token}`,
    }))
  );
});

router.put("/assinaturas/:lojaId", async (req, res) => {
  const { status, planoId, venceEm } = req.body;
  const assinatura = await prisma.assinatura.upsert({
    where: { lojaId: Number(req.params.lojaId) },
    create: {
      lojaId: Number(req.params.lojaId),
      planoId: planoId ? Number(planoId) : null,
      status: status || "ativa",
      fimTrial: venceEm ? new Date(venceEm) : new Date(),
      venceEm: venceEm ? new Date(venceEm) : new Date(),
    },
    update: {
      ...(status !== undefined ? { status } : {}),
      ...(planoId !== undefined ? { planoId: planoId ? Number(planoId) : null } : {}),
      ...(venceEm !== undefined ? { venceEm: new Date(venceEm) } : {}),
    },
    include: { plano: true },
  });

  res.json(assinatura);
});

module.exports = router;
