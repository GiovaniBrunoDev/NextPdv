const express = require("express");
const cors = require("cors");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const app = express();
const PORT = 3001;

const prisma = new PrismaClient();

// rotas do PDV
const produtoRoutes = require('./routes/produtoRoutes');
const vendaRoutes = require('./routes/vendaRoutes');
const metasRoutes = require('./routes/metas.js');
const clienteRoutes = require('./routes/clienteRoutes');

// middlewares
app.use(cors());
app.use(express.json());

// rota raiz
app.get("/", (req, res) => {
  res.send("Servidor PDV + Catálogo está funcionando 🚀");
});

// PDV
app.use('/produtos', produtoRoutes);
app.use('/vendas', vendaRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/metas", metasRoutes);
app.use('/clientes', clienteRoutes);

// Catálogo
const catalogoRouter = express.Router();

// GET /catalogo/produtos?numeracao=NN
catalogoRouter.get('/produtos', async (req, res) => {
  try {
    const numeracao = req.query.numeracao
      ? parseInt(req.query.numeracao, 10)
      : null;

    const produtos = await prisma.produto.findMany({
      where: numeracao
        ? {
            variacoes: {
              some: { numeracao } // não filtra estoque aqui
            }
          }
        : {},
      select: {
        id: true,
        nome: true,
        preco: true,
        imagemUrl: true,
        variacoes: {
          where: numeracao ? { numeracao } : {}, // pega só a numeração pedida
          select: {
            id: true,
            numeracao: true,
            estoque: true,
          },
        },
      },
    });

    res.json(produtos);
  } catch (err) {
    console.error("Erro ao buscar produtos:", err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});


// GET /catalogo/produto/:id
catalogoRouter.get('/produto/:id', async (req, res) => {
  try {
    const produto = await prisma.produto.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        id: true,
        nome: true,
        preco: true,
        precoAntigo: true,
        imagemUrl: true,
        variacoes: {
          select: {
            id: true,
            numeracao: true,
            estoque: true,
          },
        },
      },
    });

    if (!produto) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    res.json(produto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar produto" });
  }
});

// usa prefixo /catalogo
app.use('/catalogo', catalogoRouter);

// start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
