/*
  Warnings:

  - You are about to drop the column `codigo` on the `Produto` table. All the data in the column will be lost.
  - You are about to drop the column `imagemUrl` on the `Produto` table. All the data in the column will be lost.
  - You are about to drop the column `numeracao` on the `Produto` table. All the data in the column will be lost.
  - Added the required column `custoUnitario` to the `Produto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `outrosCustos` to the `Produto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tamanho` to the `Produto` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Produto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "tamanho" TEXT NOT NULL,
    "preco" REAL NOT NULL,
    "custoUnitario" REAL NOT NULL,
    "outrosCustos" REAL NOT NULL,
    "estoque" INTEGER NOT NULL
);
INSERT INTO "new_Produto" ("estoque", "id", "nome", "preco") SELECT "estoque", "id", "nome", "preco" FROM "Produto";
DROP TABLE "Produto";
ALTER TABLE "new_Produto" RENAME TO "Produto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
