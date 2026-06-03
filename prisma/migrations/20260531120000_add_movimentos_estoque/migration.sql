CREATE TABLE "MovimentoEstoque" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "variacaoProdutoId" INTEGER NOT NULL,
    "criadoPorId" INTEGER,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "saldoAnterior" INTEGER NOT NULL,
    "saldoFinal" INTEGER NOT NULL,
    "origemTipo" TEXT,
    "origemId" INTEGER,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MovimentoEstoque_lojaId_criadoEm_idx" ON "MovimentoEstoque"("lojaId", "criadoEm");

CREATE INDEX "MovimentoEstoque_variacaoProdutoId_criadoEm_idx" ON "MovimentoEstoque"("variacaoProdutoId", "criadoEm");

CREATE INDEX "MovimentoEstoque_origemTipo_origemId_idx" ON "MovimentoEstoque"("origemTipo", "origemId");

ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES "VariacaoProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
