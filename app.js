const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3001;

const produtoRoutes = require('./routes/produtoRoutes');
const vendaRoutes = require('./routes/vendaRoutes');

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Servidor PDV está funcionando 🚀");
});

app.use('/produtos', produtoRoutes);
app.use('/vendas', vendaRoutes); // <-- ISSO AQUI resolve o erro
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const clienteRoutes = require('./routes/clienteRoutes');
app.use('/clientes', clienteRoutes);


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});