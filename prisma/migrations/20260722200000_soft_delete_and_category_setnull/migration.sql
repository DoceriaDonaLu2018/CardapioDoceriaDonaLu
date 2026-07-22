-- Soft delete de produtos + categoria opcional (SetNull) + snapshot do título no OrderItem.

-- Product.isDeleted
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- Product.categoryId: Cascade -> SetNull (nullable)
ALTER TABLE "Product" ALTER COLUMN "categoryId" DROP NOT NULL;

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_categoryId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Product_isDeleted_idx" ON "Product"("isDeleted");

-- OrderItem.productTitle (snapshot)
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "productTitle" TEXT NOT NULL DEFAULT '';

-- Backfill títulos a partir do produto atual (pedidos antigos)
UPDATE "order_items" AS oi
SET "productTitle" = p."title"
FROM "Product" AS p
WHERE oi."productId" = p."id"
  AND oi."productTitle" = '';
