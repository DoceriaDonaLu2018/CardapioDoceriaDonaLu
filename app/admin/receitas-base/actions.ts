"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  computeBaseRecipeCost,
  RecipeCycleError,
  MissingRefError,
  type BaseRecipeSnapshot,
  type IngredientSnapshot,
} from "@/lib/ficha-tecnica/engine";
import { baseRecipeWriteSchema } from "@/lib/validation/safe-input";

export type BaseRecipeActionState = {
  error?: string;
  success?: boolean;
  id?: string;
};

function revalidateFichaPaths() {
  revalidatePath("/admin/receitas-base");
  revalidatePath("/admin/ficha-tecnica");
  revalidatePath("/admin/produtos");
}

async function loadSnapshotsForRecipes(recipeIds: string[]): Promise<{
  ingredientsById: Record<string, IngredientSnapshot>;
  baseRecipesById: Record<string, BaseRecipeSnapshot>;
}> {
  const baseRecipesById: Record<string, BaseRecipeSnapshot> = {};
  const queue = [...new Set(recipeIds)];

  while (queue.length > 0) {
    const batch = queue.splice(0, 40).filter((id) => !baseRecipesById[id]);
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
      baseRecipesById[row.id] = {
        id: row.id,
        name: row.name,
        yieldQuantity: row.yieldQuantity,
        yieldUnit: row.yieldUnit,
        items: row.items.map((item) => {
          if (item.componentType === "BASE_RECIPE" && item.nestedBaseRecipeId) {
            if (!baseRecipesById[item.nestedBaseRecipeId]) {
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

  const ingredientIds = new Set<string>();
  for (const recipe of Object.values(baseRecipesById)) {
    for (const item of recipe.items) {
      if (item.componentType === "INGREDIENT" && item.ingredientId) {
        ingredientIds.add(item.ingredientId);
      }
    }
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: [...ingredientIds] } },
  });
  const ingredientsById: Record<string, IngredientSnapshot> = {};
  for (const row of ingredients) {
    ingredientsById[row.id] = {
      id: row.id,
      name: row.name,
      purchasePrice: row.purchasePrice,
      purchaseQuantity: row.purchaseQuantity,
      unit: row.unit,
      wastePercent: row.wastePercent,
    };
  }

  return { ingredientsById, baseRecipesById };
}

export async function saveBaseRecipe(
  raw: unknown
): Promise<BaseRecipeActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = baseRecipeWriteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const data = parsed.data;

  for (const item of data.items) {
    if (
      item.componentType === "BASE_RECIPE" &&
      data.id &&
      item.nestedBaseRecipeId === data.id
    ) {
      return { error: "Uma receita base não pode referenciar a si mesma." };
    }
  }

  const ingredientIds = data.items
    .filter((i) => i.componentType === "INGREDIENT")
    .map((i) => i.ingredientId);
  const nestedIds = data.items
    .filter((i) => i.componentType === "BASE_RECIPE")
    .map((i) => i.nestedBaseRecipeId);

  if (ingredientIds.length > 0) {
    const found = await prisma.ingredient.count({
      where: { id: { in: ingredientIds } },
    });
    if (found !== new Set(ingredientIds).size) {
      return { error: "Um ou mais ingredientes não existem." };
    }
  }
  if (nestedIds.length > 0) {
    const found = await prisma.baseRecipe.count({
      where: { id: { in: nestedIds } },
    });
    if (found !== new Set(nestedIds).size) {
      return { error: "Uma ou mais sub-receitas não existem." };
    }
  }

  // Preview de custo / ciclo com snapshots atuais + rascunho da receita.
  const { ingredientsById, baseRecipesById } = await loadSnapshotsForRecipes([
    ...nestedIds,
    ...(data.id ? [data.id] : []),
  ]);

  const draftId = data.id ?? "__draft__";
  baseRecipesById[draftId] = {
    id: draftId,
    name: data.name,
    yieldQuantity: data.yieldQuantity,
    yieldUnit: data.yieldUnit,
    items: data.items.map((item) =>
      item.componentType === "INGREDIENT"
        ? {
            componentType: "INGREDIENT" as const,
            ingredientId: item.ingredientId,
            quantityUsed: item.quantityUsed,
          }
        : {
            componentType: "BASE_RECIPE" as const,
            nestedBaseRecipeId: item.nestedBaseRecipeId,
            quantityUsed: item.quantityUsed,
          }
    ),
  };

  let totalCost = 0;
  let unitCost = 0;
  try {
    const cost = computeBaseRecipeCost(
      draftId,
      ingredientsById,
      baseRecipesById
    );
    totalCost = cost.totalCost;
    unitCost = cost.unitCost;
  } catch (error) {
    if (error instanceof RecipeCycleError) {
      return {
        error:
          "Referência circular entre receitas base. Remova o ciclo e tente de novo.",
      };
    }
    if (error instanceof MissingRefError) {
      return { error: `${error.kind} ausente na composição.` };
    }
    throw error;
  }

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const row = data.id
        ? await tx.baseRecipe.update({
            where: { id: data.id },
            data: {
              name: data.name,
              description: data.description,
              yieldQuantity: data.yieldQuantity,
              yieldUnit: data.yieldUnit,
              totalCostCache: totalCost,
              unitCostCache: unitCost,
            },
            select: { id: true },
          })
        : await tx.baseRecipe.create({
            data: {
              name: data.name,
              description: data.description,
              yieldQuantity: data.yieldQuantity,
              yieldUnit: data.yieldUnit,
              totalCostCache: totalCost,
              unitCostCache: unitCost,
            },
            select: { id: true },
          });

      await tx.baseRecipeItem.deleteMany({ where: { baseRecipeId: row.id } });
      await tx.baseRecipeItem.createMany({
        data: data.items.map((item, index) =>
          item.componentType === "INGREDIENT"
            ? {
                baseRecipeId: row.id,
                componentType: "INGREDIENT",
                ingredientId: item.ingredientId,
                nestedBaseRecipeId: null,
                quantityUsed: item.quantityUsed,
                sortOrder: index,
              }
            : {
                baseRecipeId: row.id,
                componentType: "BASE_RECIPE",
                ingredientId: null,
                nestedBaseRecipeId: item.nestedBaseRecipeId,
                quantityUsed: item.quantityUsed,
                sortOrder: index,
              }
        ),
      });

      return row;
    });

    revalidateFichaPaths();
    return { success: true, id: saved.id };
  } catch (error) {
    console.error("saveBaseRecipe:", error);
    const message =
      error instanceof Error && error.message.includes("Unique constraint")
        ? "Já existe uma receita base com esse nome."
        : "Não foi possível salvar a receita base.";
    return { error: message };
  }
}

export async function deleteBaseRecipe(
  id: string
): Promise<BaseRecipeActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (!id || id.length < 8) return { error: "Receita inválida." };

  const usedInSheet = await prisma.technicalSheetLine.count({
    where: { baseRecipeId: id },
  });
  if (usedInSheet > 0) {
    return {
      error:
        "Esta receita base está em fichas técnicas. Remova-a das fichas antes de excluir.",
    };
  }

  const usedInBase = await prisma.baseRecipeItem.count({
    where: { nestedBaseRecipeId: id },
  });
  if (usedInBase > 0) {
    return {
      error:
        "Esta receita é usada por outras receitas base. Remova a referência antes de excluir.",
    };
  }

  try {
    await prisma.baseRecipe.delete({ where: { id } });
    revalidateFichaPaths();
    return { success: true };
  } catch (error) {
    console.error("deleteBaseRecipe:", error);
    return { error: "Não foi possível excluir a receita base." };
  }
}
