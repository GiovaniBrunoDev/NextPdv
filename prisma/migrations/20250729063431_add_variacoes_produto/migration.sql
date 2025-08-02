/*
  Warnings:

  - You are about to drop the `VariacaoEstoque` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `produtoId` on the `ItemVenda` table. All the data in the column will be lost.
  - Added the required column `variacaoProdutoId` to the `ItemVenda` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tamanho` to the `Produto` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VariacaoEstoque";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "VariacaoProduto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produtoId" INTEGER NOT NULL,
    "numeracao" TEXT NOT NULL,
    "estoque" INTEGER NOT NULL,
    CONSTRAINT "VariacaoProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ItemVenda" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "vendaId" INTEGER NOT NULL,
    "variacaoProdutoId" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,
    CONSTRAINT "ItemVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ItemVenda_variacaoProdutoId_fkey" FOREIGN KEY ("variacaoProdutoId") REFERENCES "VariacaoProduto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ItemVenda" ("id", "quantidade", "vendaId") SELECT "id", "quantidade", "vendaId" FROM "ItemVenda";
DROP TABLE "ItemVenda";
ALTER TABLE "new_ItemVenda" RENAME TO "ItemVenda";
CREATE TABLE "new_Produto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "preco" REAL NOT NULL,
    "custoUnitario" REAL NOT NULL,
    "outrosCustos" REAL NOT NULL,
    "tamanho" TEXT NOT NULL
);
INSERT INTO "new_Produto" ("custoUnitario", "id", "nome", "outrosCustos", "preco") SELECT "custoUnitario", "id", "nome", "outrosCustos", "preco" FROM "Produto";
DROP TABLE "Produto";
ALTER TABLE "new_Produto" RENAME TO "Produto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
