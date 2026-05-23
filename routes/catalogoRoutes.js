const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

const LOJA_PRINCIPAL_ID = Number(process.env.CATALOGO_LOJA_ID || 1);

const produtoInclude = {
  variacoes: true,
};

function imagemCompleta(req, produto) {
  return {
    ...produto,
    imagemUrlCompleta: produto.imagemUrl?.startsWith("/uploads")
      ? `${req.protocol}://${req.get("host")}${produto.imagemUrl}`
      : produto.imagemUrl || null,
  };
}

router.get("/produtos", async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      where: { lojaId: LOJA_PRINCIPAL_ID },
      include: produtoInclude,
      orderBy: { nome: "asc" },
    });

    res.json(produtos.map((produto) => imagemCompleta(req, produto)));
  } catch (error) {
    console.error("Erro ao listar catalogo:", error);
    res.status(500).json({ error: "Erro ao carregar catalogo." });
  }
});

router.get("/produto/:id", async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({
      where: { id: Number(req.params.id), lojaId: LOJA_PRINCIPAL_ID },
      include: produtoInclude,
    });

    if (!produto) {
      return res.status(404).json({ error: "Produto nao encontrado no catalogo principal." });
    }

    res.json(imagemCompleta(req, produto));
  } catch (error) {
    console.error("Erro ao carregar produto do catalogo:", error);
    res.status(500).json({ error: "Erro ao carregar produto." });
  }
});

module.exports = router;
