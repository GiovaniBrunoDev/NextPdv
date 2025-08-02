/*
  Warnings:

  - You are about to alter the column `tamanho` on the `VariacaoProduto` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VariacaoProduto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produtoId" INTEGER NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "estoque" INTEGER NOT NULL,
    CONSTRAINT "VariacaoProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VariacaoProduto" ("estoque", "id", "produtoId", "tamanho") SELECT "estoque", "id", "produtoId", "tamanho" FROM "VariacaoProduto";
DROP TABLE "VariacaoProduto";
ALTER TABLE "new_VariacaoProduto" RENAME TO "VariacaoProduto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
