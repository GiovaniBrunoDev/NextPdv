-- CreateTable
CREATE TABLE "LancamentoFinanceiro" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "clienteId" INTEGER,
    "tipo" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "formaPagamento" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pago',
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vencimento" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LancamentoFinanceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LancamentoFinanceiro_lojaId_data_idx" ON "LancamentoFinanceiro"("lojaId", "data");

-- CreateIndex
CREATE INDEX "LancamentoFinanceiro_lojaId_status_vencimento_idx" ON "LancamentoFinanceiro"("lojaId", "status", "vencimento");

-- CreateIndex
CREATE INDEX "LancamentoFinanceiro_clienteId_idx" ON "LancamentoFinanceiro"("clienteId");

-- AddForeignKey
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
