ALTER TABLE "ItemPedido" ALTER COLUMN "variacaoProdutoId" DROP NOT NULL;
ALTER TABLE "ItemPedido" ADD COLUMN "nomeManual" TEXT;
ALTER TABLE "ItemPedido" ADD COLUMN "numeracaoManual" TEXT;
ALTER TABLE "ItemPedido" ADD COLUMN "custoUnitario" DOUBLE PRECISION;
ALTER TABLE "ItemPedido" ADD COLUMN "outrosCustos" DOUBLE PRECISION;
ALTER TABLE "ItemPedido" DROP CONSTRAINT IF EXISTS "ItemPedido_variacaoProdutoId_fkey";
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES "VariacaoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
