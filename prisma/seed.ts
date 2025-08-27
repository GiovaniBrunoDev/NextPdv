import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Inserindo dados de teste...");

  // Criar clientes
  const cliente1 = await prisma.cliente.create({
    data: {
      nome: "João Silva",
      telefone: "11999999999",
      endereco: "Rua das Flores, 123",
      bairro: "Centro",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01001-000",
      observacoes: "Cliente VIP",
    },
  });

  const cliente2 = await prisma.cliente.create({
    data: {
      nome: "Maria Oliveira",
      telefone: "11988887777",
      cidade: "Rio de Janeiro",
      estado: "RJ",
    },
  });

  // Criar produto com variações
  const produto = await prisma.produto.create({
    data: {
      nome: "Tênis New Balance CT-303",
      preco: 299.9,
      custoUnitario: 150,
      outrosCustos: 20,
      imagemUrl: "https://meusite.com/tenis.jpg",
      variacoes: {
        create: [
          { numeracao: "38", estoque: 10 },
          { numeracao: "39", estoque: 8 },
          { numeracao: "40", estoque: 5 },
        ],
      },
    },
    include: { variacoes: true },
  });

  // Criar venda vinculada a cliente1 com item
  const venda = await prisma.venda.create({
    data: {
      total: 299.9,
      formaPagamento: "Cartão de Crédito",
      tipoEntrega: "Entrega Rápida",
      taxaEntrega: 20,
      entregador: "Carlos Motoboy",
      endereco: cliente1.endereco,
      clienteId: cliente1.id,
      itens: {
        create: [
          {
            quantidade: 1,
            variacaoProdutoId: produto.variacoes[1].id, // pega variação tamanho 39
          },
        ],
      },
    },
    include: { itens: true },
  });

  console.log("✅ Clientes criados:", cliente1, cliente2);
  console.log("✅ Produto criado:", produto);
  console.log("✅ Venda criada:", venda);
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
