const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Criar cliente
async function criarCliente(req, res) {
  const {
    nome,
    telefone,
    endereco,
    bairro,
    cidade,
    estado,
    cep,
    observacoes
  } = req.body;

  try {
    const novo = await prisma.cliente.create({
      data: {
        nome,
        telefone,
        endereco,
        bairro,
        cidade,
        estado,
        cep,
        observacoes
      },
    });
    res.status(201).json(novo);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao criar cliente', detalhes: error.message });
  }
}

// Listar todos os clientes
async function listarClientes(req, res) {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nome: 'asc' }
  });
  res.json(clientes);
}

// Buscar cliente por ID
async function buscarCliente(req, res) {
  const { id } = req.params;
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(id) } });

  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cliente);
}

// Atualizar cliente
async function atualizarCliente(req, res) {
  const { id } = req.params;
  const {
    nome,
    telefone,
    endereco,
    bairro,
    cidade,
    estado,
    cep,
    observacoes
  } = req.body;

  try {
    const atualizado = await prisma.cliente.update({
      where: { id: Number(id) },
      data: {
        nome,
        telefone,
        endereco,
        bairro,
        cidade,
        estado,
        cep,
        observacoes
      },
    });
    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar cliente', detalhes: error.message });
  }
}

// Deletar cliente
async function deletarCliente(req, res) {
  const { id } = req.params;
  try {
    await prisma.cliente.delete({ where: { id: Number(id) } });
    res.json({ mensagem: 'Cliente excluído com sucesso' });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao deletar cliente', detalhes: error.message });
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
