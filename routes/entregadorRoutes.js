const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

router.get("/", requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const entregadores = await prisma.entregador.findMany({
      where: { lojaId: lojaId(req), ativo: true },
      orderBy: { nome: "asc" },
    });

    res.json(entregadores);
  } catch (error) {
    console.error("Erro ao listar entregadores:", error);
    res.status(500).json({ error: "Erro ao listar entregadores." });
  }
});

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const telefone = String(req.body.telefone || "").trim() || null;

  if (!nome) {
    return res.status(400).json({ error: "Informe o nome do entregador." });
  }

  try {
    const existente = await prisma.entregador.findFirst({
      where: { lojaId: lojaId(req), nome },
    });

    const entregador = existente
      ? await prisma.entregador.update({
          where: { id: existente.id },
          data: { telefone, ativo: true },
        })
      : await prisma.entregador.create({
          data: {
            lojaId: lojaId(req),
            nome,
            telefone,
          },
        });

    res.status(201).json(entregador);
  } catch (error) {
    console.error("Erro ao cadastrar entregador:", error);
    if (error.code === "P2002") {
      const entregador = await prisma.entregador.findFirst({
        where: { lojaId: lojaId(req), nome },
      });
      if (entregador) return res.status(200).json(entregador);
    }
    res.status(400).json({ error: error.message || "Erro ao cadastrar entregador." });
  }
});

module.exports = router;
