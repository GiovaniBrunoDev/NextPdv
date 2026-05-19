-- AlterTable
ALTER TABLE "Venda" ADD COLUMN "subtotalProdutos" DOUBLE PRECISION;
ALTER TABLE "Venda" ADD COLUMN "desconto" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "ItemVenda" ADD COLUMN "precoUnitario" DOUBLE PRECISION;
ALTER TABLE "ItemVenda" ADD COLUMN "custoUnitario" DOUBLE PRECISION;
ALTER TABLE "ItemVenda" ADD COLUMN "outrosCustos" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "EntradaEstoque" (
    "id" SERIAL NOT NULL,
    "variacaoProdutoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" DOUBLE PRECISION,
    "outrosCustos" DOUBLE PRECISION,
    "fornecedor" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntradaEstoque_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EntradaEstoque" ADD CONSTRAINT "EntradaEstoque_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES "VariacaoProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
