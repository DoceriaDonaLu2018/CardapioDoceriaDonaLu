/**
 * Repositório / helpers de impacto de custo (server-side).
 * Usar ao atualizar Ingredient.purchasePrice — grava histórico e lista produtos afetados.
 */

import { prisma } from "@/lib/prisma";
import {
  evaluateIngredientPriceImpact,
  type BaseRecipeSnapshot,
  type CostImpactRow,
  type DynamicCostSnapshot,
  type IngredientSnapshot,
  type SheetLineSnapshot,
} from "@/lib/ficha-tecnica/engine";

function toIngredientSnapshot(row: {
  id: string;
  name: string;
  purchasePrice: number;
  purchaseQuantity: number;
  unit: string;
  wastePercent: number;
}): IngredientSnapshot {
  return {
    id: row.id,
    name: row.name,
    purchasePrice: row.purchasePrice,
    purchaseQuantity: row.purchaseQuantity,
    unit: row.unit,
    wastePercent: row.wastePercent,
  };
}

/**
 * Carrega sub-receitas referenciadas (fecho transitivo simples por BFS).
 */
async function loadBaseRecipesClosure(
  seedIds: string[]
): Promise<Record<string, BaseRecipeSnapshot>> {
  const byId: Record<string, BaseRecipeSnapshot> = {};
  const queue = [...new Set(seedIds.filter(Boolean))];

  while (queue.length > 0) {
    const batch = queue.splice(0, 50).filter((id) => !byId[id]);
    if (batch.length === 0) continue;

    const rows = await prisma.baseRecipe.findMany({
      where: { id: { in: batch } },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            componentType: true,
            ingredientId: true,
            nestedBaseRecipeId: true,
            quantityUsed: true,
          },
        },
      },
    });

    for (const row of rows) {
      byId[row.id] = {
        id: row.id,
        name: row.name,
        yieldQuantity: row.yieldQuantity,
        yieldUnit: row.yieldUnit,
        items: row.items.map((item) => {
          if (item.componentType === "BASE_RECIPE" && item.nestedBaseRecipeId) {
            if (!byId[item.nestedBaseRecipeId]) {
              queue.push(item.nestedBaseRecipeId);
            }
            return {
              componentType: "BASE_RECIPE" as const,
              nestedBaseRecipeId: item.nestedBaseRecipeId,
              quantityUsed: item.quantityUsed,
            };
          }
          return {
            componentType: "INGREDIENT" as const,
            ingredientId: item.ingredientId ?? "",
            quantityUsed: item.quantityUsed,
          };
        }),
      };
    }
  }

  return byId;
}

/**
 * Após alterar preço de um ingrediente: persiste histórico e retorna impacto
 * em fichas técnicas / produtos (margem no preço atual).
 */
export async function recordIngredientPriceChangeAndImpact(params: {
  ingredientId: string;
  oldPurchasePrice: number;
  newPurchasePrice: number;
  oldPurchaseQty?: number;
  newPurchaseQty?: number;
  note?: string;
}): Promise<{ historyId: string; impacts: CostImpactRow[] }> {
  const ingredient = await prisma.ingredient.findUniqueOrThrow({
    where: { id: params.ingredientId },
  });

  const history = await prisma.ingredientPriceHistory.create({
    data: {
      ingredientId: params.ingredientId,
      oldPurchasePrice: params.oldPurchasePrice,
      newPurchasePrice: params.newPurchasePrice,
      oldPurchaseQty: params.oldPurchaseQty,
      newPurchaseQty: params.newPurchaseQty,
      note: params.note,
    },
    select: { id: true },
  });

  // Fichas que usam o ingrediente direto OU via sub-receita.
  const sheets = await prisma.technicalSheet.findMany({
    where: {
      OR: [
        { lines: { some: { ingredientId: params.ingredientId } } },
        {
          lines: {
            some: {
              baseRecipe: {
                OR: [
                  { items: { some: { ingredientId: params.ingredientId } } },
                  {
                    items: {
                      some: {
                        nestedBaseRecipe: {
                          items: { some: { ingredientId: params.ingredientId } },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
    include: {
      product: { select: { id: true, title: true, price: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          componentType: true,
          ingredientId: true,
          baseRecipeId: true,
          quantityUsed: true,
        },
      },
      dynamicCosts: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, kind: true, value: true },
      },
    },
  });

  const baseRecipeIds = sheets.flatMap((s) =>
    s.lines
      .filter((l) => l.componentType === "BASE_RECIPE" && l.baseRecipeId)
      .map((l) => l.baseRecipeId as string)
  );
  const baseRecipesById = await loadBaseRecipesClosure(baseRecipeIds);

  const ingredientIds = new Set<string>([params.ingredientId]);
  for (const recipe of Object.values(baseRecipesById)) {
    for (const item of recipe.items) {
      if (item.componentType === "INGREDIENT") {
        ingredientIds.add(item.ingredientId);
      }
    }
  }
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      if (line.ingredientId) ingredientIds.add(line.ingredientId);
    }
  }

  const ingredientRows = await prisma.ingredient.findMany({
    where: { id: { in: [...ingredientIds] } },
  });
  const ingredientsById: Record<string, IngredientSnapshot> = {};
  for (const row of ingredientRows) {
    ingredientsById[row.id] = toIngredientSnapshot(row);
  }

  const oldIngredient: IngredientSnapshot = {
    ...toIngredientSnapshot(ingredient),
    purchasePrice: params.oldPurchasePrice,
    purchaseQuantity: params.oldPurchaseQty ?? ingredient.purchaseQuantity,
  };
  const newIngredient: IngredientSnapshot = {
    ...toIngredientSnapshot(ingredient),
    purchasePrice: params.newPurchasePrice,
    purchaseQuantity: params.newPurchaseQty ?? ingredient.purchaseQuantity,
  };

  const sheetInputs = sheets.map((sheet) => {
    const lines: SheetLineSnapshot[] = sheet.lines.map((line) => {
      if (line.componentType === "BASE_RECIPE" && line.baseRecipeId) {
        return {
          componentType: "BASE_RECIPE" as const,
          baseRecipeId: line.baseRecipeId,
          quantityUsed: line.quantityUsed,
        };
      }
      return {
        componentType: "INGREDIENT" as const,
        ingredientId: line.ingredientId ?? "",
        quantityUsed: line.quantityUsed,
      };
    });
    const dynamicCosts: DynamicCostSnapshot[] = sheet.dynamicCosts.map((c) => ({
      name: c.name,
      kind: c.kind === "PERCENT" ? "PERCENT" : "FIXED",
      value: c.value,
    }));
    return {
      productId: sheet.product.id,
      productTitle: sheet.product.title,
      currentPrice: sheet.product.price,
      lines,
      dynamicCosts,
    };
  });

  const impacts = evaluateIngredientPriceImpact({
    ingredientId: params.ingredientId,
    oldIngredient,
    newIngredient,
    sheets: sheetInputs,
    baseRecipesById,
    ingredientsById,
  });

  return { historyId: history.id, impacts };
}
