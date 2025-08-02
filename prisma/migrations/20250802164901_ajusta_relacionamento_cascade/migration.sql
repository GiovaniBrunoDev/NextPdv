-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VariacaoProduto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produtoId" INTEGER NOT NULL,
    "numeracao" TEXT NOT NULL,
    "estoque" INTEGER NOT NULL,
    CONSTRAINT "VariacaoProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VariacaoProduto" ("estoque", "id", "numeracao", "produtoId") SELECT "estoque", "id", "numeracao", "produtoId" FROM "VariacaoProduto";
DROP TABLE "VariacaoProduto";
ALTER TABLE "new_VariacaoProduto" RENAME TO "VariacaoProduto";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
