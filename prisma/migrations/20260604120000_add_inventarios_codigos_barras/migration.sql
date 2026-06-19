ALTER TABLE "VariacaoProduto" ADD COLUMN "codigoBarras" TEXT;

CREATE UNIQUE INDEX "VariacaoProduto_codigoBarras_key" ON "VariacaoProduto"("codigoBarras");

CREATE TABLE "InventarioEstoque" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "criadoPorId" INTEGER,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'em_andamento',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioEstoque_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventarioItem" (
    "id" SERIAL NOT NULL,
    "inventarioId" INTEGER NOT NULL,
    "variacaoProdutoId" INTEGER,
    "produtoNome" TEXT NOT NULL,
    "numeracao" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "estoqueSistema" INTEGER NOT NULL,
    "quantidadeContada" INTEGER,
    "conferidoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventarioEstoque_lojaId_status_idx" ON "InventarioEstoque"("lojaId", "status");
CREATE INDEX "InventarioEstoque_lojaId_iniciadoEm_idx" ON "InventarioEstoque"("lojaId", "iniciadoEm");
CREATE UNIQUE INDEX "InventarioItem_inventarioId_variacaoProdutoId_key" ON "InventarioItem"("inventarioId", "variacaoProdutoId");
CREATE INDEX "InventarioItem_inventarioId_codigoBarras_idx" ON "InventarioItem"("inventarioId", "codigoBarras");

ALTER TABLE "InventarioEstoque" ADD CONSTRAINT "InventarioEstoque_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventarioEstoque" ADD CONSTRAINT "InventarioEstoque_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioEstoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES "VariacaoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
