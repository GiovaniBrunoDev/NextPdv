const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const cliente = await prisma.cliente.create({
    data: { nome: "João Teste", telefone: "11999999999" }
  });

  console.log("Cliente criado:", cliente);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => prisma.$disconnect());
