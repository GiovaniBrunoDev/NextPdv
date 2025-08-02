/*
  Warnings:

  - You are about to drop the column `tamanho` on the `VariacaoProduto` table. All the data in the column will be lost.
  - Added the required column `tamanho` to the `Produto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numeracao` to the `VariacaoProduto` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Produto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "preco" REAL NOT NULL,
    "custoUnitario" REAL NOT NULL,
    "outrosCustos" REAL NOT NULL,
    "tamanho" INTEGER NOT NULL
);
INSERT INTO "new_Produto" ("custoUnitario", "id", "nome", "outrosCustos", "preco") SELECT "custoUnitario", "id", "nome", "outrosCustos", "preco" FROM "Produto";
DROP TABLE "Produto";
ALTER TABLE "new_Produto" RENAME TO "Produto";
CREATE TABLE "new_VariacaoProduto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produtoId" INTEGER NOT NULL,
    "numeracao" TEXT NOT NULL,
    "estoque" INTEGER NOT NULL,
    CONSTRAINT "VariacaoProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VariacaoProduto" ("estoque", "id", "produtoId") SELECT "estoque", "id", "produtoId" FROM "VariacaoProduto";
DROP TABLE "VariacaoProduto";
ALTER TABLE "new_VariacaoProduto" RENAME TO "VariacaoProduto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
