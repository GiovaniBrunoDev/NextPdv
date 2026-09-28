CREATE TABLE "InscricaoPush" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InscricaoPush_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InscricaoPush_endpoint_key" ON "InscricaoPush"("endpoint");
CREATE INDEX "InscricaoPush_lojaId_usuarioId_ativo_idx" ON "InscricaoPush"("lojaId", "usuarioId", "ativo");

ALTER TABLE "InscricaoPush"
ADD CONSTRAINT "InscricaoPush_lojaId_fkey"
FOREIGN KEY ("lojaId") REFERENCES "Loja"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InscricaoPush"
ADD CONSTRAINT "InscricaoPush_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
