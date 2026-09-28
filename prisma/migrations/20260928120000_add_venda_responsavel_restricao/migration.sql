ALTER TABLE "MembroLoja"
ADD COLUMN "vendasPropriasApenas" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Venda"
ADD COLUMN "criadoPorId" INTEGER;

UPDATE "Venda" AS venda
SET "criadoPorId" = movimento."criadoPorId"
FROM (
  SELECT DISTINCT ON ("vendaId")
    "vendaId",
    "criadoPorId"
  FROM "MovimentoCaixa"
  WHERE "vendaId" IS NOT NULL
    AND "criadoPorId" IS NOT NULL
  ORDER BY "vendaId", "criadoEm" ASC
) AS movimento
WHERE venda."id" = movimento."vendaId";

CREATE INDEX "Venda_lojaId_criadoPorId_data_idx"
ON "Venda"("lojaId", "criadoPorId", "data");

ALTER TABLE "Venda"
ADD CONSTRAINT "Venda_criadoPorId_fkey"
FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
