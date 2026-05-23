-- CreateTable
CREATE TABLE "Loja" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "superadmin" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroLoja" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "papel" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembroLoja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plano" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "valorMensal" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assinatura" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "planoId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "inicioTrial" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimTrial" TIMESTAMP(3) NOT NULL,
    "venceEm" TIMESTAMP(3) NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConviteLoja" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT,
    "nomeLoja" TEXT NOT NULL,
    "slugLoja" TEXT NOT NULL,
    "planoId" INTEGER,
    "papel" TEXT NOT NULL DEFAULT 'admin',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "criadoPorId" INTEGER,
    "lojaId" INTEGER,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConviteLoja_pkey" PRIMARY KEY ("id")
);

-- Bootstrap current data into the first tenant.
INSERT INTO "Loja" ("id", "nome", "slug", "ativa", "criadaEm", "atualizadaEm")
VALUES (1, 'Loja Principal', 'loja-principal', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Plano" ("id", "nome", "valorMensal", "descricao", "ativo", "criadoEm", "atualizadoEm")
VALUES (1, 'Mensal', 0, 'Plano mensal manual inicial', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Assinatura" ("lojaId", "planoId", "status", "inicioTrial", "fimTrial", "venceEm", "criadaEm", "atualizadaEm")
VALUES (1, 1, 'ativa', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '14 days', CURRENT_TIMESTAMP + INTERVAL '365 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN "lojaId" INTEGER;
UPDATE "Produto" SET "lojaId" = 1 WHERE "lojaId" IS NULL;
ALTER TABLE "Produto" ALTER COLUMN "lojaId" SET NOT NULL;

ALTER TABLE "Cliente" ADD COLUMN "lojaId" INTEGER;
UPDATE "Cliente" SET "lojaId" = 1 WHERE "lojaId" IS NULL;
ALTER TABLE "Cliente" ALTER COLUMN "lojaId" SET NOT NULL;

ALTER TABLE "Venda" ADD COLUMN "lojaId" INTEGER;
UPDATE "Venda" SET "lojaId" = 1 WHERE "lojaId" IS NULL;
ALTER TABLE "Venda" ALTER COLUMN "lojaId" SET NOT NULL;

ALTER TABLE "Pedido" ADD COLUMN "lojaId" INTEGER;
UPDATE "Pedido" SET "lojaId" = 1 WHERE "lojaId" IS NULL;
ALTER TABLE "Pedido" ALTER COLUMN "lojaId" SET NOT NULL;

ALTER TABLE "Meta" ADD COLUMN "lojaId" INTEGER;
UPDATE "Meta" SET "lojaId" = 1 WHERE "lojaId" IS NULL;
ALTER TABLE "Meta" ALTER COLUMN "lojaId" SET NOT NULL;

ALTER TABLE "EntradaEstoque" ADD COLUMN "lojaId" INTEGER;
UPDATE "EntradaEstoque" SET "lojaId" = 1 WHERE "lojaId" IS NULL;
ALTER TABLE "EntradaEstoque" ALTER COLUMN "lojaId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Loja_slug_key" ON "Loja"("slug");
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX "MembroLoja_usuarioId_lojaId_key" ON "MembroLoja"("usuarioId", "lojaId");
CREATE UNIQUE INDEX "Assinatura_lojaId_key" ON "Assinatura"("lojaId");
CREATE UNIQUE INDEX "ConviteLoja_token_key" ON "ConviteLoja"("token");

CREATE INDEX "Produto_lojaId_idx" ON "Produto"("lojaId");
CREATE INDEX "Cliente_lojaId_idx" ON "Cliente"("lojaId");
CREATE INDEX "Venda_lojaId_idx" ON "Venda"("lojaId");
CREATE INDEX "Pedido_lojaId_idx" ON "Pedido"("lojaId");
CREATE INDEX "Meta_lojaId_idx" ON "Meta"("lojaId");
CREATE INDEX "EntradaEstoque_lojaId_idx" ON "EntradaEstoque"("lojaId");

-- AddForeignKey
ALTER TABLE "MembroLoja" ADD CONSTRAINT "MembroLoja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembroLoja" ADD CONSTRAINT "MembroLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConviteLoja" ADD CONSTRAINT "ConviteLoja_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConviteLoja" ADD CONSTRAINT "ConviteLoja_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConviteLoja" ADD CONSTRAINT "ConviteLoja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntradaEstoque" ADD CONSTRAINT "EntradaEstoque_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT setval(pg_get_serial_sequence('"Loja"', 'id'), GREATEST((SELECT MAX("id") FROM "Loja"), 1));
SELECT setval(pg_get_serial_sequence('"Plano"', 'id'), GREATEST((SELECT MAX("id") FROM "Plano"), 1));
