const express = require("express");
const cors = require("cors");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const app = express();
const PORT = process.env.PORT || 3001;

const prisma = new PrismaClient();

const LOJA_PRINCIPAL_ID = 1;

// rotas do PDV
const produtoRoutes = require('./routes/produtoRoutes');
const vendaRoutes = require('./routes/vendaRoutes');
const metasRoutes = require('./routes/metas.js');
const clienteRoutes = require('./routes/clienteRoutes');
const pedidosRoutes = require("./routes/pedidos");
const uploadVideoRoute = require("./routes/uploadVideo");
const relatorioRoutes = require("./routes/relatorioRoutes");
const estoqueRoutes = require("./routes/estoqueRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { authRequired, lojaRequired } = require("./middlewares/auth");

// middlewares
app.use(cors());
app.use(express.json());

// rota raiz
app.get("/", (req, res) => {
  res.send("Servidor PDV + Catálogo está funcionando 🚀");
});

// PDV
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use('/produtos', authRequired, lojaRequired, produtoRoutes);
app.use('/vendas', authRequired, lojaRequired, vendaRoutes);
app.use("/metas", authRequired, lojaRequired, metasRoutes);
app.use('/clientes', authRequired, lojaRequired, clienteRoutes);
app.use("/pedidos", authRequired, lojaRequired, pedidosRoutes);
app.use("/relatorios", authRequired, lojaRequired, relatorioRoutes);
app.use("/estoque", authRequired, lojaRequired, estoqueRoutes);

// Catálogo
const catalogoRouter = express.Router();

// GET /catalogo/produtos?numeracao=NN
catalogoRouter.get('/produtos', async (req, res) => {
  try {
    const numeracao = req.query.numeracao || null;

    const produtos = await prisma.produto.findMany({
      where: numeracao
        ? {
            lojaId: LOJA_PRINCIPAL_ID,
            variacoes: {
              some: {
                numeracao,
              },
            },
          }
        : {
            lojaId: LOJA_PRINCIPAL_ID,
          },
      select: {
        id: true,
        nome: true,
        preco: true,
        imagemUrl: true,
        videoUrl: true,
        gifUrl: true,
        variacoes: {
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
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

// GET /catalogo/produto/:id
catalogoRouter.get('/produto/:id', async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({
      where: {
        id: Number(req.params.id),
        lojaId: LOJA_PRINCIPAL_ID,
      },
      select: {
        id: true,
        nome: true,
        preco: true,
        imagemUrl: true,
        videoUrl: true,
        gifUrl: true,
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

app.use(authRequired, lojaRequired, uploadVideoRoute);

// start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
