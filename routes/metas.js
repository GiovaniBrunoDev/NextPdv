const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// Criar meta
router.post("/", async (req, res) => {
  try {
    const { titulo, descricao, valorMeta, tipo, periodo } = req.body;

    if (!titulo || valorMeta == null) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    const novaMeta = await prisma.meta.create({
      data: { titulo, descricao, valorMeta, tipo, periodo },
    });

    res.json(novaMeta);
  } catch (err) {
    console.error("Erro ao criar meta:", err);
    res.status(500).json({ error: "Erro ao criar meta", details: err.message });
  }
});


// Listar todas
router.get("/", async (req, res) => {
  try {
    const metas = await prisma.meta.findMany({ orderBy: { criadoEm: "desc" } });
    res.json(metas);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar metas" });
  }
});

// Buscar uma
router.get("/:id", async (req, res) => {
  try {
    const meta = await prisma.meta.findUnique({ where: { id: Number(req.params.id) } });
    if (!meta) return res.status(404).json({ error: "Meta não encontrada" });
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar meta" });
  }
});

// Atualizar
router.put("/:id", async (req, res) => {
  try {
    const { titulo, descricao, valorMeta, tipo, periodo } = req.body;
    const meta = await prisma.meta.update({
      where: { id: Number(req.params.id) },
      data: { titulo, descricao, valorMeta, tipo, periodo },
    });
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar meta" });
  }
});

// Excluir
router.delete("/:id", async (req, res) => {
  try {
    await prisma.meta.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Meta excluída com sucesso" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir meta" });
  }
});

module.exports = router;
