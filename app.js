const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

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

const catalogoRouter = express.Router();
catalogoRouter.get("/produtos", (req, res) => {
  res.status(410).json({ error: "Catalogo publico desativado na versao multi-loja." });
});
catalogoRouter.get("/produto/:id", (req, res) => {
  res.status(410).json({ error: "Catalogo publico desativado na versao multi-loja." });
});
app.use("/catalogo", catalogoRouter);

app.use(cors());
app.use(express.json());

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
