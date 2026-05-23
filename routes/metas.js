const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const { titulo, descricao, valorMeta, tipo, periodo } = req.body;
    if (!titulo || valorMeta == null) {
      return res.status(400).json({ error: "Campos obrigatorios faltando" });
    }

    const novaMeta = await prisma.meta.create({
      data: {
        lojaId: lojaId(req),
        titulo,
        descricao,
        valorMeta: Number(valorMeta),
        tipo,
        periodo,
      },
    });

    res.json(novaMeta);
  } catch (err) {
    console.error("Erro ao criar meta:", err);
    res.status(500).json({ error: "Erro ao criar meta", details: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const metas = await prisma.meta.findMany({
      where: { lojaId: lojaId(req) },
      orderBy: { criadoEm: "desc" },
    });
    res.json(metas);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar metas" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const meta = await prisma.meta.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req) },
    });
    if (!meta) return res.status(404).json({ error: "Meta nao encontrada" });
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar meta" });
  }
});

router.put("/:id", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const { titulo, descricao, valorMeta, tipo, periodo } = req.body;
    const existente = await prisma.meta.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req) },
    });
    if (!existente) return res.status(404).json({ error: "Meta nao encontrada" });

    const meta = await prisma.meta.update({
      where: { id: existente.id },
      data: { titulo, descricao, valorMeta: Number(valorMeta), tipo, periodo },
    });
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar meta" });
  }
});

router.delete("/:id", assinaturaAtivaRequired, requireRole("admin"), async (req, res) => {
  try {
    const existente = await prisma.meta.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req) },
    });
    if (!existente) return res.status(404).json({ error: "Meta nao encontrada" });

    await prisma.meta.delete({ where: { id: existente.id } });
    res.json({ message: "Meta excluida com sucesso" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir meta" });
  }
});

module.exports = router;
