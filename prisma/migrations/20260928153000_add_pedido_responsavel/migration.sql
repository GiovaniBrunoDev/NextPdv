ALTER TABLE "Pedido"
ADD COLUMN "criadoPorId" INTEGER;

UPDATE "Pedido" AS pedido
SET "criadoPorId" = movimento."criadoPorId"
FROM (
  SELECT DISTINCT ON ("origemId")
    "origemId",
    "criadoPorId"
  FROM "MovimentoEstoque"
  WHERE "origemTipo" = 'pedido'
    AND "origemId" IS NOT NULL
    AND "criadoPorId" IS NOT NULL
  ORDER BY "origemId", "criadoEm" ASC
) AS movimento
WHERE pedido."id" = movimento."origemId";

CREATE INDEX "Pedido_lojaId_criadoPorId_dataCriacao_idx"
ON "Pedido"("lojaId", "criadoPorId", "dataCriacao");

ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_criadoPorId_fkey"
FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
