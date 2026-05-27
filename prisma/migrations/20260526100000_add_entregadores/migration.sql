CREATE TABLE "Entregador" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entregador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Entregador_lojaId_nome_key" ON "Entregador"("lojaId", "nome");
CREATE INDEX "Entregador_lojaId_ativo_idx" ON "Entregador"("lojaId", "ativo");

ALTER TABLE "Entregador" ADD CONSTRAINT "Entregador_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
