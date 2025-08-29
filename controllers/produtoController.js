  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const multer = require("multer");
  const path = require("path");
  const fs = require("fs");


// Buscar produtos por nome (inteligente)
async function buscarProdutos(req, res) {
  const { q } = req.query; // texto da busca

  try {
    const produtos = await prisma.produto.findMany({
      where: {
        nome: {
          contains: q || "", // busca parcial
          mode: "insensitive", // ignora maiúsculas/minúsculas
        },
      },
      include: {
        variacoes: true,
      },
    });

    const produtosComImagem = produtos.map((p) => ({
      ...p,
      imagemUrlCompleta: p.imagemUrl
        ? `${req.protocol}://${req.get("host")}${p.imagemUrl}`
        : null,
    }));

    res.json(produtosComImagem);
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    res
      .status(500)
      .json({ error: "Erro ao buscar produtos", detalhes: error.message });
  }
}


 // Buscar por ID
  async function buscarProduto(req, res) {
    const { id } = req.params;
    const produto = await prisma.produto.findUnique({ where: { id: Number(id) } });

    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(produto);
  }

  // Criar novo produto com variações
  async function criarProduto(req, res) {
    const {
      nome,
      preco,
      custoUnitario,
      imagemUrl,
       outrosCustos,
      variacoes // [{ numeracao: "34", estoque: 5 }, ...]
    } = req.body;

    try {
      const novo = await prisma.produto.create({
        data: {
          nome,
          preco,
          custoUnitario,
          imagemUrl,
          outrosCustos,
          variacoes: {
            create: variacoes.map(v => ({
              numeracao: v.numeracao,
              estoque: v.estoque
            }))
          }
        },
        include: {
          variacoes: true
        }
      });

      res.status(201).json(novo);
    } catch (error) {
      console.error("Erro ao criar produto:", error);
      res.status(400).json({
        error: 'Erro ao criar produto',
        detalhes: error.message
      });
    }
  }

  // Listar produtos com variações
 async function listarProdutos(req, res) {
  try {
    const produtos = await prisma.produto.findMany({
      include: {
        variacoes: true
      }
    });

    const produtosComImagem = produtos.map(p => ({
      ...p,
      imagemUrlCompleta: p.imagemUrl
        ? `${req.protocol}://${req.get('host')}${p.imagemUrl}`
        : null
    }));

    res.json(produtosComImagem);
  } catch (error) {
    console.error("Erro ao listar produtos:", error);
    res.status(500).json({ error: "Erro ao listar produtos", detalhes: error.message });
  }
}



  // Atualizar produto
  async function atualizarProduto(req, res) {
    const { id } = req.params;
    const { nome, codigo, preco, numeracao, estoque, imagemUrl } = req.body;

    try {
      const atualizado = await prisma.produto.update({
        where: { id: Number(id) },
        data: { nome, codigo, preco, numeracao, estoque, imagemUrl }
      });
      res.json(atualizado);
    } catch (error) {
      res.status(400).json({ error: 'Erro ao atualizar', detalhes: error.message });
    }
  }

  // Deletar produto
  async function deletarProduto(req, res) {
    const { id } = req.params;

    try {
      await prisma.produto.delete({ where: { id: Number(id) } });
      res.json({ mensagem: 'Produto removido com sucesso' });
    } catch (error) {
      res.status(400).json({ error: 'Erro ao deletar', detalhes: error.message });
    }
  }

  // Atualizar estoque de uma variação específica
  async function atualizarEstoqueVariacao(req, res) {
    const { id } = req.params;
    const { estoque } = req.body;

    try {
      const variacaoAtualizada = await prisma.variacaoProduto.update({
        where: { id: Number(id) },
        data: { estoque: Number(estoque) },
      });

      res.json(variacaoAtualizada);
    } catch (error) {
      res.status(400).json({ error: "Erro ao atualizar estoque", detalhes: error.message });
    }
  }

  // Deletar uma variação específica
  async function deletarVariacao(req, res) {
    const { id } = req.params;

    try {
      await prisma.variacaoProduto.delete({ where: { id: Number(id) } });
      res.json({ mensagem: 'Variação removida com sucesso' });
    } catch (error) {
      res.status(400).json({ error: 'Erro ao deletar variação', detalhes: error.message });
    }
  }

  // POST /produtos/:id/variacoes
  async function adicionarVariacao(req, res) {
    const { id } = req.params;
    const { numeracao, estoque } = req.body;

    try {
      const variacao = await prisma.variacaoProduto.create({
        data: {
          produtoId: Number(id),
          numeracao,
          estoque: Number(estoque),
        },
      });
      res.status(201).json(variacao);
    } catch (error) {
      res.status(400).json({ error: "Erro ao adicionar variação", detalhes: error.message });
    }
  }

  //upload imagens
  // Garante que a pasta uploads exista
  const pastaUploads = path.join(__dirname, "../uploads");
  if (!fs.existsSync(pastaUploads)) {
    fs.mkdirSync(pastaUploads);
  }

  // Configuração do multer
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, pastaUploads),
    filename: (req, file, cb) => {
      const nomeUnico = `${Date.now()}-${file.originalname}`;
      cb(null, nomeUnico);
    },
  });
  const upload = multer({ storage });

  // Middleware exportado para uso nas rotas
  const uploadImagem = upload.single("imagem");

  // Rota handler
  async function fazerUploadImagem(req, res) {
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });

    const imageUrl = `/uploads/${req.file.filename}`;
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
    uploadImagem,         // middleware do multer
    fazerUploadImagem,     // handler da imagem
    prisma
  };
