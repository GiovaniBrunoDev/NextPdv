CREATE TABLE "Caixa" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "abertoPorId" INTEGER,
    "fechadoPorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "valorInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorFinalInformado" DOUBLE PRECISION,
    "valorFinalCalculado" DOUBLE PRECISION,
    "diferenca" DOUBLE PRECISION,
    "observacaoAbertura" TEXT,
    "observacaoFechamento" TEXT,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),

    CONSTRAINT "Caixa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovimentoCaixa" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "caixaId" INTEGER NOT NULL,
    "vendaId" INTEGER,
    "criadoPorId" INTEGER,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "formaPagamento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoCaixa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Caixa_lojaId_status_idx" ON "Caixa"("lojaId", "status");
CREATE INDEX "Caixa_abertoEm_idx" ON "Caixa"("abertoEm");
CREATE INDEX "MovimentoCaixa_lojaId_criadoEm_idx" ON "MovimentoCaixa"("lojaId", "criadoEm");
CREATE INDEX "MovimentoCaixa_caixaId_tipo_idx" ON "MovimentoCaixa"("caixaId", "tipo");
CREATE INDEX "MovimentoCaixa_vendaId_idx" ON "MovimentoCaixa"("vendaId");

ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_abertoPorId_fkey" FOREIGN KEY ("abertoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Caixa" ADD CONSTRAINT "Caixa_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "Caixa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
