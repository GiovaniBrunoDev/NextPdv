const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function lojaId(req) {
  return req.loja.id;
}

async function criarCliente(req, res) {
  const { nome, telefone, endereco, bairro, cidade, estado, cep, observacoes } = req.body;

  try {
    const novo = await prisma.cliente.create({
      data: {
        lojaId: lojaId(req),
        nome,
        telefone,
        endereco,
        bairro,
        cidade,
        estado,
        cep,
        observacoes,
      },
    });
    res.status(201).json(novo);
  } catch (error) {
    res.status(400).json({ error: "Erro ao criar cliente", detalhes: error.message });
  }
}

async function listarClientes(req, res) {
  const clientes = await prisma.cliente.findMany({
    where: { lojaId: lojaId(req) },
    orderBy: { nome: "asc" },
  });
  res.json(clientes);
}

async function buscarCliente(req, res) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: Number(req.params.id), lojaId: lojaId(req) },
  });

  if (!cliente) return res.status(404).json({ error: "Cliente nao encontrado" });
  res.json(cliente);
}

async function atualizarCliente(req, res) {
  const id = Number(req.params.id);
  const { nome, telefone, endereco, bairro, cidade, estado, cep, observacoes } = req.body;

  try {
    const existente = await prisma.cliente.findFirst({ where: { id, lojaId: lojaId(req) } });
    if (!existente) return res.status(404).json({ error: "Cliente nao encontrado" });

    const atualizado = await prisma.cliente.update({
      where: { id },
      data: { nome, telefone, endereco, bairro, cidade, estado, cep, observacoes },
    });
    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: "Erro ao atualizar cliente", detalhes: error.message });
  }
}

async function deletarCliente(req, res) {
  const id = Number(req.params.id);
  try {
    const existente = await prisma.cliente.findFirst({ where: { id, lojaId: lojaId(req) } });
    if (!existente) return res.status(404).json({ error: "Cliente nao encontrado" });

    await prisma.cliente.delete({ where: { id } });
    res.json({ mensagem: "Cliente excluido com sucesso" });
  } catch (error) {
    res.status(400).json({ error: "Erro ao deletar cliente", detalhes: error.message });
  }
}

module.exports = {
  criarCliente,
  listarClientes,
  buscarCliente,
  atualizarCliente,
  deletarCliente,
  prisma,
};
