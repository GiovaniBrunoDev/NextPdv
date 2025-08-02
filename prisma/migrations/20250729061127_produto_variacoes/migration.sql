/*
  Warnings:

  - You are about to drop the column `estoque` on the `Produto` table. All the data in the column will be lost.
  - You are about to drop the column `tamanho` on the `Produto` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "VariacaoEstoque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produtoId" INTEGER NOT NULL,
    "numeracao" TEXT NOT NULL,
    "estoque" INTEGER NOT NULL,
    CONSTRAINT "VariacaoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Produto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "preco" REAL NOT NULL,
    "custoUnitario" REAL NOT NULL,
    "outrosCustos" REAL NOT NULL
);
INSERT INTO "new_Produto" ("custoUnitario", "id", "nome", "outrosCustos", "preco") SELECT "custoUnitario", "id", "nome", "outrosCustos", "preco" FROM "Produto";
DROP TABLE "Produto";
ALTER TABLE "new_Produto" RENAME TO "Produto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
