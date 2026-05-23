const { PrismaClient } = require("@prisma/client");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { findGifByVideoUrl } = require("../services/videoGifCache");

const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

function produtoInclude() {
  return { variacoes: true };
}

function imagemCompleta(req, produto) {
  return {
    ...produto,
    imagemUrlCompleta: produto.imagemUrl
      ? `${req.protocol}://${req.get("host")}${produto.imagemUrl}`
      : null,
  };
}

async function buscarProdutos(req, res) {
  const { q } = req.query;

  try {
    const produtos = await prisma.produto.findMany({
      where: {
        lojaId: lojaId(req),
        nome: {
          contains: q || "",
          mode: "insensitive",
        },
      },
      include: produtoInclude(),
    });

    res.json(produtos.map((produto) => imagemCompleta(req, produto)));
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    res.status(500).json({ error: "Erro ao buscar produtos", detalhes: error.message });
  }
}

async function buscarProduto(req, res) {
  const produto = await prisma.produto.findFirst({
    where: { id: Number(req.params.id), lojaId: lojaId(req) },
    include: produtoInclude(),
  });

  if (!produto) return res.status(404).json({ error: "Produto nao encontrado" });
  res.json(imagemCompleta(req, produto));
}

async function criarProduto(req, res) {
  const {
    nome,
    preco,
    custoUnitario,
    imagemUrl,
    videoUrl,
    gifUrl,
    outrosCustos,
    variacoes = [],
  } = req.body;

  const gifUrlFinal = gifUrl || findGifByVideoUrl(videoUrl);

  try {
    const novo = await prisma.produto.create({
      data: {
        lojaId: lojaId(req),
        nome,
        preco: Number(preco || 0),
        custoUnitario: Number(custoUnitario || 0),
        imagemUrl,
        videoUrl,
        gifUrl: gifUrlFinal,
        outrosCustos: Number(outrosCustos || 0),
        variacoes: {
          create: variacoes.map((variacao) => ({
            numeracao: variacao.numeracao,
            estoque: Number(variacao.estoque || 0),
          })),
        },
      },
      include: produtoInclude(),
    });

    res.status(201).json(novo);
  } catch (error) {
    console.error("Erro ao criar produto:", error);
    res.status(400).json({ error: "Erro ao criar produto", detalhes: error.message });
  }
}

async function listarProdutos(req, res) {
  try {
    const produtos = await prisma.produto.findMany({
      where: { lojaId: lojaId(req) },
      include: produtoInclude(),
      orderBy: { nome: "asc" },
    });

    res.json(produtos.map((produto) => imagemCompleta(req, produto)));
  } catch (error) {
    console.error("Erro ao listar produtos:", error);
    res.status(500).json({ error: "Erro ao listar produtos", detalhes: error.message });
  }
}

async function atualizarProduto(req, res) {
  const id = Number(req.params.id);
  const {
    nome,
    preco,
    custoUnitario,
    outrosCustos,
    imagemUrl,
    videoUrl,
    gifUrl,
  } = req.body;

  const produto = await prisma.produto.findFirst({ where: { id, lojaId: lojaId(req) } });
  if (!produto) return res.status(404).json({ error: "Produto nao encontrado." });

  const data = {};
  if (nome !== undefined) data.nome = nome;
  if (preco !== undefined) data.preco = Number(preco);
  if (custoUnitario !== undefined) data.custoUnitario = Number(custoUnitario);
  if (outrosCustos !== undefined) data.outrosCustos = Number(outrosCustos);
  if (imagemUrl !== undefined) data.imagemUrl = imagemUrl;
  if (videoUrl !== undefined) data.videoUrl = videoUrl;
  if (gifUrl !== undefined || videoUrl !== undefined) {
    data.gifUrl = gifUrl || findGifByVideoUrl(videoUrl);
  }

  try {
    const atualizado = await prisma.produto.update({
      where: { id },
      data,
      include: produtoInclude(),
    });
    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: "Erro ao atualizar", detalhes: error.message });
  }
}

async function deletarProduto(req, res) {
  const id = Number(req.params.id);
  const produto = await prisma.produto.findFirst({ where: { id, lojaId: lojaId(req) } });
  if (!produto) return res.status(404).json({ error: "Produto nao encontrado." });

  try {
    await prisma.produto.delete({ where: { id } });
    res.json({ mensagem: "Produto removido com sucesso" });
  } catch (error) {
    res.status(400).json({ error: "Erro ao deletar", detalhes: error.message });
  }
}

async function atualizarEstoqueVariacao(req, res) {
  const id = Number(req.params.id);
  const { estoque } = req.body;

  try {
    const variacao = await prisma.variacaoProduto.findFirst({
      where: { id, produto: { lojaId: lojaId(req) } },
    });
    if (!variacao) return res.status(404).json({ error: "Variacao nao encontrada." });

    const variacaoAtualizada = await prisma.variacaoProduto.update({
      where: { id },
      data: { estoque: Number(estoque) },
    });

    res.json(variacaoAtualizada);
  } catch (error) {
    res.status(400).json({ error: "Erro ao atualizar estoque", detalhes: error.message });
  }
}

async function deletarVariacao(req, res) {
  const id = Number(req.params.id);
  const variacao = await prisma.variacaoProduto.findFirst({
    where: { id, produto: { lojaId: lojaId(req) } },
  });
  if (!variacao) return res.status(404).json({ error: "Variacao nao encontrada." });

  try {
    await prisma.variacaoProduto.delete({ where: { id } });
    res.json({ mensagem: "Variacao removida com sucesso" });
  } catch (error) {
    res.status(400).json({ error: "Erro ao deletar variacao", detalhes: error.message });
  }
}

async function adicionarVariacao(req, res) {
  const produtoId = Number(req.params.id);
  const { numeracao, estoque } = req.body;

  const produto = await prisma.produto.findFirst({ where: { id: produtoId, lojaId: lojaId(req) } });
  if (!produto) return res.status(404).json({ error: "Produto nao encontrado." });

  try {
    const variacao = await prisma.variacaoProduto.create({
      data: {
        produtoId,
        numeracao,
        estoque: Number(estoque),
      },
    });
    res.status(201).json(variacao);
  } catch (error) {
    res.status(400).json({ error: "Erro ao adicionar variacao", detalhes: error.message });
  }
}

const pastaUploads = path.join(__dirname, "../uploads");
if (!fs.existsSync(pastaUploads)) fs.mkdirSync(pastaUploads);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const pastaLoja = path.join(pastaUploads, "lojas", String(req.loja.id));
    fs.mkdirSync(pastaLoja, { recursive: true });
    cb(null, pastaLoja);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });
const uploadImagem = upload.single("imagem");

async function fazerUploadImagem(req, res) {
  if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });

  const imageUrl = `/uploads/lojas/${req.loja.id}/${req.file.filename}`;
  res.json({ imageUrl });
}

module.exports = {
  listarProdutos,
  buscarProduto,
  buscarProdutos,
  criarProduto,
  atualizarProduto,
  deletarProduto,
  atualizarEstoqueVariacao,
  deletarVariacao,
  adicionarVariacao,
  uploadImagem,
  fazerUploadImagem,
  prisma,
};
