-- Ficha Técnica Enterprise (additive): FC, sub-receitas, custos dinâmicos, histórico.

ALTER TABLE "Ingredient" ADD COLUMN "wastePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "ingredient_price_history" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "oldPurchasePrice" DOUBLE PRECISION NOT NULL,
    "newPurchasePrice" DOUBLE PRECISION NOT NULL,
    "oldPurchaseQty" DOUBLE PRECISION,
    "newPurchaseQty" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingredient_price_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "base_recipes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "yieldQuantity" DOUBLE PRECISION NOT NULL,
    "yieldUnit" TEXT NOT NULL,
    "unitCostCache" DOUBLE PRECISION,
    "totalCostCache" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "base_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "base_recipe_items" (
    "id" TEXT NOT NULL,
    "baseRecipeId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL DEFAULT 'INGREDIENT',
    "ingredientId" TEXT,
    "nestedBaseRecipeId" TEXT,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "base_recipe_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_sheets" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "desiredMarkupPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "lastTotalCost" DOUBLE PRECISION,
    "lastSuggestedPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "technical_sheets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_sheet_lines" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL DEFAULT 'INGREDIENT',
    "ingredientId" TEXT,
    "baseRecipeId" TEXT,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "technical_sheet_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_sheet_costs" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIXED',
    "value" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "technical_sheet_costs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "base_recipes_name_key" ON "base_recipes"("name");
CREATE UNIQUE INDEX "technical_sheets_productId_key" ON "technical_sheets"("productId");
CREATE INDEX "ingredient_price_history_ingredientId_createdAt_idx" ON "ingredient_price_history"("ingredientId", "createdAt");
CREATE INDEX "base_recipe_items_baseRecipeId_sortOrder_idx" ON "base_recipe_items"("baseRecipeId", "sortOrder");
CREATE INDEX "base_recipe_items_ingredientId_idx" ON "base_recipe_items"("ingredientId");
CREATE INDEX "base_recipe_items_nestedBaseRecipeId_idx" ON "base_recipe_items"("nestedBaseRecipeId");
CREATE INDEX "technical_sheet_lines_sheetId_sortOrder_idx" ON "technical_sheet_lines"("sheetId", "sortOrder");
CREATE INDEX "technical_sheet_lines_ingredientId_idx" ON "technical_sheet_lines"("ingredientId");
CREATE INDEX "technical_sheet_lines_baseRecipeId_idx" ON "technical_sheet_lines"("baseRecipeId");
CREATE INDEX "technical_sheet_costs_sheetId_sortOrder_idx" ON "technical_sheet_costs"("sheetId", "sortOrder");

ALTER TABLE "ingredient_price_history" ADD CONSTRAINT "ingredient_price_history_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "base_recipe_items" ADD CONSTRAINT "base_recipe_items_baseRecipeId_fkey" FOREIGN KEY ("baseRecipeId") REFERENCES "base_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "base_recipe_items" ADD CONSTRAINT "base_recipe_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "base_recipe_items" ADD CONSTRAINT "base_recipe_items_nestedBaseRecipeId_fkey" FOREIGN KEY ("nestedBaseRecipeId") REFERENCES "base_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_sheet_lines" ADD CONSTRAINT "technical_sheet_lines_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_sheet_lines" ADD CONSTRAINT "technical_sheet_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_sheet_lines" ADD CONSTRAINT "technical_sheet_lines_baseRecipeId_fkey" FOREIGN KEY ("baseRecipeId") REFERENCES "base_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "technical_sheet_costs" ADD CONSTRAINT "technical_sheet_costs_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
