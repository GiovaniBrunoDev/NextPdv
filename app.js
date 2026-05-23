const express = require("express");
const cors = require("cors");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();

const produtoRoutes = require("./routes/produtoRoutes");
const vendaRoutes = require("./routes/vendaRoutes");
const metasRoutes = require("./routes/metas");
const clienteRoutes = require("./routes/clienteRoutes");
const pedidosRoutes = require("./routes/pedidos");
const uploadVideoRoute = require("./routes/uploadVideo");
const relatorioRoutes = require("./routes/relatorioRoutes");
const estoqueRoutes = require("./routes/estoqueRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { authRequired, lojaRequired } = require("./middlewares/auth");

app.use(cors());
app.use(express.json());

const catalogoRouter = express.Router();
const CATALOGO_LOJA_ID = Number(process.env.CATALOGO_LOJA_ID || 1);

const catalogoSelect = {
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
};

catalogoRouter.get("/produtos", async (req, res) => {
  try {
    const numeracao = req.query.numeracao ? String(req.query.numeracao) : null;

    const produtos = await prisma.produto.findMany({
      where: {
        lojaId: CATALOGO_LOJA_ID,
        ...(numeracao
          ? {
              variacoes: {
                some: {
                  numeracao,
                  estoque: { gt: 0 },
                },
              },
            }
          : {}),
      },
      select: catalogoSelect,
      orderBy: { nome: "asc" },
    });

    res.json(produtos);
  } catch (error) {
    console.error("Erro ao carregar catalogo:", error);
    res.status(500).json({ error: "Erro ao carregar catalogo." });
  }
});

catalogoRouter.get("/produto/:id", async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({
      where: {
        id: Number(req.params.id),
        lojaId: CATALOGO_LOJA_ID,
      },
      select: catalogoSelect,
    });

    if (!produto) {
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    res.json(produto);
  } catch (error) {
    console.error("Erro ao carregar produto do catalogo:", error);
    res.status(500).json({ error: "Erro ao carregar produto." });
  }
});
app.use("/catalogo", catalogoRouter);

app.get("/", (req, res) => {
  res.send("Servidor PDV multi-loja esta funcionando.");
});

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/produtos", authRequired, lojaRequired, produtoRoutes);
app.use("/vendas", authRequired, lojaRequired, vendaRoutes);
app.use("/metas", authRequired, lojaRequired, metasRoutes);
app.use("/clientes", authRequired, lojaRequired, clienteRoutes);
app.use("/pedidos", authRequired, lojaRequired, pedidosRoutes);
app.use("/relatorios", authRequired, lojaRequired, relatorioRoutes);
app.use("/estoque", authRequired, lojaRequired, estoqueRoutes);
app.use(authRequired, lojaRequired, uploadVideoRoute);



app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
