function mensagemPublica(error, fallback) {
  const mensagem = String(error?.message || "").trim();
  const interna =
    !mensagem ||
    mensagem.includes("Invalid `prisma.") ||
    mensagem.includes("Transaction API error") ||
    mensagem.includes("PrismaClient") ||
    mensagem.includes("Unique constraint") ||
    mensagem.includes("Foreign key constraint") ||
    mensagem.includes("timed out") ||
    mensagem.includes("timeout");

  return interna ? fallback : mensagem;
}

module.exports = {
  mensagemPublica,
};
