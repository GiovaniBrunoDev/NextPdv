const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

router.get("/", requireRole("admin", "gerente"), async (req, res) => {
  try {
    const fornecedores = await prisma.fornecedor.findMany({
      where: { lojaId: lojaId(req), ativo: true },
      orderBy: { nome: "asc" },
    });

    res.json(fornecedores);
  } catch (error) {
    console.error("Erro ao listar fornecedores:", error);
    res.status(500).json({ error: "Erro ao listar fornecedores." });
  }
});

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const telefone = String(req.body.telefone || "").trim() || null;
  const observacao = String(req.body.observacao || "").trim() || null;

  if (!nome) {
    return res.status(400).json({ error: "Informe o nome do fornecedor." });
  }

  try {
    const fornecedor = await prisma.fornecedor.upsert({
      where: {
        lojaId_nome: {
          lojaId: lojaId(req),
          nome,
        },
      },
      update: {
        telefone,
        observacao,
        ativo: true,
      },
      create: {
        lojaId: lojaId(req),
        nome,
        telefone,
        observacao,
      },
    });

    res.status(201).json(fornecedor);
  } catch (error) {
    console.error("Erro ao cadastrar fornecedor:", error);
    res.status(400).json({ error: "Erro ao cadastrar fornecedor." });
  }
});

module.exports = router;
