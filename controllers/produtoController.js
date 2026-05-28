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
  return { variacoes: true, fornecedor: true };
}

function normalizarGenero(genero) {
  return ["feminino", "masculino", "unissex"].includes(genero) ? genero : "unissex";
}

function numeroFormulario(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(numero) ? numero : null;
}

function urlAbsoluta(valor) {
  return /^https?:\/\//i.test(String(valor || ""));
}

async function validarFornecedorDaLoja(fornecedorId, loja) {
  if (fornecedorId === null || fornecedorId === undefined || fornecedorId === "") return null;

  const id = Number(fornecedorId);
  if (!id) throw new Error("Fornecedor invalido.");

  const fornecedor = await prisma.fornecedor.findFirst({
    where: { id, lojaId: loja, ativo: true },
  });

  if (!fornecedor) throw new Error("Fornecedor nao encontrado nesta loja.");
  return fornecedor.id;
}

function imagemCompleta(req, produto) {
  const imagemUrl = produto.imagemUrl || null;

  return {
    ...produto,
    imagemUrlCompleta: imagemUrl && !urlAbsoluta(imagemUrl)
      ? `${req.protocol}://${req.get("host")}${imagemUrl}`
      : imagemUrl,
  };
}

async function baixarImagemProduto(req, res) {
  try {
    const produto = await prisma.produto.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req) },
      select: { id: true, imagemUrl: true },
    });

    if (!produto) return res.status(404).json({ error: "Produto nao encontrado." });
    if (!produto.imagemUrl) return res.status(404).json({ error: "Produto sem imagem." });

    if (urlAbsoluta(produto.imagemUrl)) {
      const resposta = await fetch(produto.imagemUrl);
      if (!resposta.ok) return res.status(502).json({ error: "Nao foi possivel baixar a imagem." });

      const contentType = resposta.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await resposta.arrayBuffer());

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.send(buffer);
    }

    const uploadsRoot = path.resolve(__dirname, "../uploads");
    const caminhoRelativo = produto.imagemUrl.replace(/^\/+/, "");
    const caminhoImagem = path.resolve(__dirname, "..", caminhoRelativo);
    const relativoUploads = path.relative(uploadsRoot, caminhoImagem);

    if (relativoUploads.startsWith("..") || path.isAbsolute(relativoUploads) || !fs.existsSync(caminhoImagem)) {
      return res.status(404).json({ error: "Imagem nao encontrada." });
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(caminhoImagem);
  } catch (error) {
    console.error("Erro ao baixar imagem do produto:", error);
    return res.status(500).json({ error: "Erro ao baixar imagem", detalhes: error.message });
  }
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
    marca,
    genero,
    fornecedorId,
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
    const nomeLimpo = String(nome || "").trim();
    const precoNumero = numeroFormulario(preco);
    const custoNumero = numeroFormulario(custoUnitario);
    const outrosCustosNumero = numeroFormulario(outrosCustos) ?? 0;

    if (!nomeLimpo) return res.status(400).json({ error: "Informe o nome do produto." });
    if (precoNumero === null || precoNumero <= 0) {
      return res.status(400).json({ error: "Informe o preco de venda do produto." });
    }
    if (custoNumero === null || custoNumero < 0) {
      return res.status(400).json({ error: "Informe o custo unitario do produto." });
    }
    if (outrosCustosNumero < 0) {
      return res.status(400).json({ error: "Informe outros custos corretamente." });
    }

    const fornecedorValidoId = await validarFornecedorDaLoja(fornecedorId, lojaId(req));

    const novo = await prisma.produto.create({
      data: {
        lojaId: lojaId(req),
        fornecedorId: fornecedorValidoId,
        nome: nomeLimpo,
        marca: marca?.trim() || null,
        genero: normalizarGenero(genero),
        preco: precoNumero,
        custoUnitario: custoNumero,
        imagemUrl,
        videoUrl,
        gifUrl: gifUrlFinal,
        outrosCustos: outrosCustosNumero,
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
    marca,
    genero,
    fornecedorId,
    preco,
    custoUnitario,
    outrosCustos,
    imagemUrl,
    videoUrl,
    gifUrl,
  } = req.body;

  try {
    const produto = await prisma.produto.findFirst({ where: { id, lojaId: lojaId(req) } });
    if (!produto) return res.status(404).json({ error: "Produto nao encontrado." });

    const data = {};
    if (nome !== undefined) {
      const nomeLimpo = String(nome || "").trim();
      if (!nomeLimpo) return res.status(400).json({ error: "Informe o nome do produto." });
      data.nome = nomeLimpo;
    }
    if (marca !== undefined) data.marca = marca?.trim() || null;
    if (genero !== undefined) data.genero = normalizarGenero(genero);
    if (fornecedorId !== undefined) data.fornecedorId = await validarFornecedorDaLoja(fornecedorId, lojaId(req));
    if (preco !== undefined) {
      const precoNumero = numeroFormulario(preco);
      if (precoNumero === null || precoNumero <= 0) return res.status(400).json({ error: "Informe o preco de venda do produto." });
      data.preco = precoNumero;
    }
    if (custoUnitario !== undefined) {
      const custoNumero = numeroFormulario(custoUnitario);
      if (custoNumero === null || custoNumero < 0) return res.status(400).json({ error: "Informe o custo unitario do produto." });
      data.custoUnitario = custoNumero;
    }
    if (outrosCustos !== undefined) {
      const outrosCustosNumero = numeroFormulario(outrosCustos);
      if (outrosCustosNumero === null || outrosCustosNumero < 0) return res.status(400).json({ error: "Informe outros custos corretamente." });
      data.outrosCustos = outrosCustosNumero;
    }
    if (imagemUrl !== undefined) data.imagemUrl = imagemUrl;
    if (videoUrl !== undefined) data.videoUrl = videoUrl;
    if (gifUrl !== undefined || videoUrl !== undefined) {
      data.gifUrl = gifUrl || findGifByVideoUrl(videoUrl);
    }

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
  baixarImagemProduto,
  uploadImagem,
  fazerUploadImagem,
  prisma,
};
