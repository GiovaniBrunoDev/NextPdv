CREATE TABLE "Fornecedor" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Produto" ADD COLUMN "fornecedorId" INTEGER;
ALTER TABLE "Produto" ADD COLUMN "genero" TEXT NOT NULL DEFAULT 'unissex';

INSERT INTO "Fornecedor" ("lojaId", "nome", "atualizadoEm")
SELECT DISTINCT "lojaId", btrim("fornecedor"), CURRENT_TIMESTAMP
FROM "EntradaEstoque"
WHERE "fornecedor" IS NOT NULL AND btrim("fornecedor") <> '';

CREATE UNIQUE INDEX "Fornecedor_lojaId_nome_key" ON "Fornecedor"("lojaId", "nome");
CREATE INDEX "Fornecedor_lojaId_ativo_idx" ON "Fornecedor"("lojaId", "ativo");

ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
