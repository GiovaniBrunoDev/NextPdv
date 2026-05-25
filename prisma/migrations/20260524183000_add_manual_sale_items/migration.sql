ALTER TABLE "ItemVenda" ADD COLUMN "nomeManual" TEXT;
ALTER TABLE "ItemVenda" ADD COLUMN "numeracaoManual" TEXT;

ALTER TABLE "ItemVenda" DROP CONSTRAINT "ItemVenda_variacaoProdutoId_fkey";
ALTER TABLE "ItemVenda" ALTER COLUMN "variacaoProdutoId" DROP NOT NULL;
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES "VariacaoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
