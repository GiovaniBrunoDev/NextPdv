-- AlterTable
ALTER TABLE "LancamentoFinanceiro"
ADD COLUMN "contaId" INTEGER,
ADD COLUMN "vendaId" INTEGER,
ADD COLUMN "vendaPagamentoId" INTEGER,
ADD COLUMN "criadoPorId" INTEGER,
ADD COLUMN "recorrenciaId" INTEGER,
ADD COLUMN "valorBruto" DOUBLE PRECISION,
ADD COLUMN "valorTaxa" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN "valorLiquido" DOUBLE PRECISION,
ADD COLUMN "parcelaNumero" INTEGER,
ADD COLUMN "parcelasTotal" INTEGER,
ADD COLUMN "observacao" TEXT;

-- CreateTable
CREATE TABLE "ContaFinanceira" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "saldoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoFinanceira" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "taxaDebito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prazoDebitoDias" INTEGER NOT NULL DEFAULT 1,
    "taxaCredito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prazoCreditoDias" INTEGER NOT NULL DEFAULT 30,
    "parcelasCreditoMax" INTEGER NOT NULL DEFAULT 6,
    "contaDinheiroId" INTEGER,
    "contaPixId" INTEGER,
    "contaDebitoId" INTEGER,
    "contaCreditoId" INTEGER,
    "contaPrazoId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaPagamento" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "vendaId" INTEGER NOT NULL,
    "contaId" INTEGER,
    "forma" TEXT NOT NULL,
    "valorBruto" DOUBLE PRECISION NOT NULL,
    "valorTaxa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorLiquido" DOUBLE PRECISION NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pago',
    "vencimento" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespesaRecorrente" (
    "id" SERIAL NOT NULL,
    "lojaId" INTEGER NOT NULL,
    "contaId" INTEGER,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "formaPagamento" TEXT,
    "diaVencimento" INTEGER NOT NULL,
    "proximaGeracao" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DespesaRecorrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaFinanceira_lojaId_nome_key" ON "ContaFinanceira"("lojaId", "nome");
CREATE INDEX "ContaFinanceira_lojaId_tipo_ativo_idx" ON "ContaFinanceira"("lojaId", "tipo", "ativo");
CREATE UNIQUE INDEX "ConfiguracaoFinanceira_lojaId_key" ON "ConfiguracaoFinanceira"("lojaId");
CREATE INDEX "VendaPagamento_lojaId_vendaId_idx" ON "VendaPagamento"("lojaId", "vendaId");
CREATE INDEX "VendaPagamento_lojaId_forma_idx" ON "VendaPagamento"("lojaId", "forma");
CREATE INDEX "VendaPagamento_contaId_idx" ON "VendaPagamento"("contaId");
CREATE INDEX "DespesaRecorrente_lojaId_ativo_proximaGeracao_idx" ON "DespesaRecorrente"("lojaId", "ativo", "proximaGeracao");
CREATE INDEX "LancamentoFinanceiro_lojaId_contaId_data_idx" ON "LancamentoFinanceiro"("lojaId", "contaId", "data");
CREATE INDEX "LancamentoFinanceiro_vendaId_idx" ON "LancamentoFinanceiro"("vendaId");
CREATE INDEX "LancamentoFinanceiro_vendaPagamentoId_idx" ON "LancamentoFinanceiro"("vendaPagamentoId");

-- AddForeignKey
ALTER TABLE "ContaFinanceira" ADD CONSTRAINT "ContaFinanceira_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfiguracaoFinanceira" ADD CONSTRAINT "ConfiguracaoFinanceira_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendaPagamento" ADD CONSTRAINT "VendaPagamento_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendaPagamento" ADD CONSTRAINT "VendaPagamento_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendaPagamento" ADD CONSTRAINT "VendaPagamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DespesaRecorrente" ADD CONSTRAINT "DespesaRecorrente_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DespesaRecorrente" ADD CONSTRAINT "DespesaRecorrente_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_vendaPagamentoId_fkey" FOREIGN KEY ("vendaPagamentoId") REFERENCES "VendaPagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LancamentoFinanceiro" ADD CONSTRAINT "LancamentoFinanceiro_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "DespesaRecorrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
