-- Default de estoque passa a 1 (novos produtos).
ALTER TABLE "Product" ALTER COLUMN "stockQuantity" SET DEFAULT 1;

-- Só produtos ainda no default antigo (999) → 1.
-- Assim o comando é seguro de rodar em todo deploy sem apagar estoque já ajustado.
UPDATE "Product" SET "stockQuantity" = 1 WHERE "stockQuantity" = 999;
