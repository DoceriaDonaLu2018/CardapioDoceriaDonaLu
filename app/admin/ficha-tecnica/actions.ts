"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  computeTechnicalSheetWithDesiredMarkup,
  type BaseRecipeSnapshot,
  type CostImpactRow,
  type IngredientSnapshot,
  type SheetLineSnapshot,
} from "@/lib/ficha-tecnica/engine";
import { technicalSheetSaveSchema } from "@/lib/validation/safe-input";
import type { PricingMode } from "@/lib/pricing";

export type FichaActionState = {
  error?: string;
  success?: boolean;
  totalCost?: number;
  sellingPrice?: number;
  impacts?: CostImpactRow[];
};

export type SaveTechnicalSheetInput = {
  productId: string;
  mode: PricingMode;
  strategyValue: number;
  desiredMarkupPercent?: number | null;
  lines: Array<
    | {
        componentType: "INGREDIENT";
        ingredientId?: string;
        name: string;
        packagePrice: number;
        packageQuantity: number;
        unit: "kg" | "g" | "mg" | "L" | "ml" | "un";
        wastePercent: number;
        quantityUsed: number;
      }
    | {
        componentType: "BASE_RECIPE";
        baseRecipeId: string;
        quantityUsed: number;
      }
  >;
  dynamicCosts: Array<{
    name: string;
    kind: "FIXED" | "PERCENT";
    value: number;
  }>;
};

/** @deprecated — use SaveTechnicalSheetInput; mantido para tipagem antiga. */
export type SaveFichaInput = SaveTechnicalSheetInput & {
  sellingPrice?: number;
  totalCost?: number;
  ingredients?: never;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Salva ficha Enterprise.
 * REGRA: preço/custo finais vêm da engine no server — payload do client é só estrutura.
 */
export async function saveFichaTecnica(
  rawInput: unknown
): Promise<FichaActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = technicalSheetSaveSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados da ficha inválidos.",
    };
  }

  const data = parsed.data;

  const product = await prisma.product.findFirst({
    where: { id: data.productId, isDeleted: false },
    select: { id: true },
  });
  if (!product) {
    return { error: "Produto não encontrado." };
  }

  const ingredientLines = data.lines.filter(
    (l): l is Extract<(typeof data.lines)[number], { componentType: "INGREDIENT" }> =>
      l.componentType === "INGREDIENT" && l.quantityUsed > 0 && Boolean(l.name.trim())
  );
  const baseLines = data.lines.filter(
    (l): l is Extract<(typeof data.lines)[number], { componentType: "BASE_RECIPE" }> =>
      l.componentType === "BASE_RECIPE" && l.quantityUsed > 0
  );
  const dynamicCosts = data.dynamicCosts.filter(
    (c) => c.name.trim() && c.value >= 0
  );

  if (ingredientLines.length === 0 && baseLines.length === 0) {
    return { error: "Adicione ao menos um ingrediente ou receita base." };
  }

  const baseRecipeIds = [...new Set(baseLines.map((l) => l.baseRecipeId))];
  if (baseRecipeIds.length > 0) {
    const count = await prisma.baseRecipe.count({
      where: { id: { in: baseRecipeIds } },
    });
    if (count !== baseRecipeIds.length) {
      return { error: "Uma ou mais receitas base não existem." };
    }
  }

  const impacts: CostImpactRow[] = [];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const resolvedIngredientIds: string[] = [];
      const usedByIngredient = new Map<string, number>();
      const ingredientsById: Record<string, IngredientSnapshot> = {};

      // Upsert matérias-primas das linhas (com histórico se preço mudou).
      for (const line of ingredientLines) {
        if (line.componentType !== "INGREDIENT") continue;
        const name = line.name.trim();

        let existing =
          (line.ingredientId
            ? await tx.ingredient.findUnique({ where: { id: line.ingredientId } })
            : null) ??
          (await tx.ingredient.findUnique({ where: { name } }));

        if (existing) {
          const priceChanged =
            Math.abs(existing.purchasePrice - line.packagePrice) > 0.0001 ||
            Math.abs(existing.purchaseQuantity - line.packageQuantity) > 0.0001;

          if (priceChanged) {
            await tx.ingredientPriceHistory.create({
              data: {
                ingredientId: existing.id,
                oldPurchasePrice: existing.purchasePrice,
                newPurchasePrice: line.packagePrice,
                oldPurchaseQty: existing.purchaseQuantity,
                newPurchaseQty: line.packageQuantity,
                note: "Atualizado pela ficha técnica",
              },
            });
          }

          existing = await tx.ingredient.update({
            where: { id: existing.id },
            data: {
              name,
              purchasePrice: line.packagePrice,
              purchaseQuantity: line.packageQuantity,
              unit: line.unit,
              wastePercent: line.wastePercent,
            },
          });
        } else {
          existing = await tx.ingredient.create({
            data: {
              name,
              purchasePrice: line.packagePrice,
              purchaseQuantity: line.packageQuantity,
              unit: line.unit,
              wastePercent: line.wastePercent,
            },
          });
        }

        resolvedIngredientIds.push(existing.id);
        usedByIngredient.set(
          existing.id,
          (usedByIngredient.get(existing.id) ?? 0) + line.quantityUsed
        );
        ingredientsById[existing.id] = {
          id: existing.id,
          name: existing.name,
          purchasePrice: existing.purchasePrice,
          purchaseQuantity: existing.purchaseQuantity,
          unit: existing.unit,
          wastePercent: existing.wastePercent,
        };
      }

      // Carrega fecho de sub-receitas.
      const baseRecipesById: Record<string, BaseRecipeSnapshot> = {};
      const queue = [...baseRecipeIds];
      while (queue.length > 0) {
        const batch = queue.splice(0, 40).filter((id) => !baseRecipesById[id]);
        if (batch.length === 0) continue;
        const rows = await tx.baseRecipe.findMany({
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

      const missingIngredientIds = new Set<string>();
      for (const recipe of Object.values(baseRecipesById)) {
        for (const item of recipe.items) {
          if (
            item.componentType === "INGREDIENT" &&
            item.ingredientId &&
            !ingredientsById[item.ingredientId]
          ) {
            missingIngredientIds.add(item.ingredientId);
          }
        }
      }
      if (missingIngredientIds.size > 0) {
        const extras = await tx.ingredient.findMany({
          where: { id: { in: [...missingIngredientIds] } },
        });
        for (const row of extras) {
          ingredientsById[row.id] = {
            id: row.id,
            name: row.name,
            purchasePrice: row.purchasePrice,
            purchaseQuantity: row.purchaseQuantity,
            unit: row.unit,
            wastePercent: row.wastePercent,
          };
        }
      }

      // Monta linhas na ordem do form (só válidas).
      const sheetLines: SheetLineSnapshot[] = [];
      let ingCursor = 0;
      for (const line of data.lines) {
        if (line.componentType === "INGREDIENT") {
          if (!(line.quantityUsed > 0 && line.name.trim())) continue;
          const id = resolvedIngredientIds[ingCursor++];
          if (!id) continue;
          sheetLines.push({
            componentType: "INGREDIENT",
            ingredientId: id,
            name: line.name.trim(),
            quantityUsed: line.quantityUsed,
          });
        } else if (line.quantityUsed > 0) {
          sheetLines.push({
            componentType: "BASE_RECIPE",
            baseRecipeId: line.baseRecipeId,
            quantityUsed: line.quantityUsed,
          });
        }
      }

      const pricing = computeTechnicalSheetWithDesiredMarkup(
        {
          lines: sheetLines,
          dynamicCosts: dynamicCosts.map((c) => ({
            name: c.name,
            kind: c.kind,
            value: c.value,
          })),
          mode: data.mode,
          strategyValue: data.strategyValue,
          ingredientsById,
          baseRecipesById,
        },
        data.desiredMarkupPercent
      );

      if (!pricing.isValid) {
        throw new Error(
          pricing.errors[0] ??
            "Cálculo inviável. Ajuste markup, margem ou custos percentuais."
        );
      }

      const sheet = await tx.technicalSheet.upsert({
        where: { productId: data.productId },
        create: {
          productId: data.productId,
          desiredMarkupPercent: data.desiredMarkupPercent ?? null,
          lastTotalCost: pricing.totalCost,
          lastSuggestedPrice:
            pricing.suggestedPriceByDesiredMarkup ?? pricing.sellingPrice,
        },
        update: {
          desiredMarkupPercent: data.desiredMarkupPercent ?? null,
          lastTotalCost: pricing.totalCost,
          lastSuggestedPrice:
            pricing.suggestedPriceByDesiredMarkup ?? pricing.sellingPrice,
        },
        select: { id: true },
      });

      await tx.technicalSheetLine.deleteMany({ where: { sheetId: sheet.id } });
      await tx.technicalSheetCost.deleteMany({ where: { sheetId: sheet.id } });

      if (sheetLines.length > 0) {
        await tx.technicalSheetLine.createMany({
          data: sheetLines.map((line, index) =>
            line.componentType === "INGREDIENT"
              ? {
                  sheetId: sheet.id,
                  componentType: "INGREDIENT",
                  ingredientId: line.ingredientId,
                  baseRecipeId: null,
                  quantityUsed: line.quantityUsed,
                  sortOrder: index,
                }
              : {
                  sheetId: sheet.id,
                  componentType: "BASE_RECIPE",
                  ingredientId: null,
                  baseRecipeId: line.baseRecipeId,
                  quantityUsed: line.quantityUsed,
                  sortOrder: index,
                }
          ),
        });
      }

      if (dynamicCosts.length > 0) {
        await tx.technicalSheetCost.createMany({
          data: dynamicCosts.map((cost, index) => ({
            sheetId: sheet.id,
            name: cost.name,
            kind: cost.kind,
            value: cost.value,
            sortOrder: index,
          })),
        });
      }

      // Compat legado: RecipeItem só com matérias-primas diretas.
      await tx.recipeItem.deleteMany({ where: { productId: data.productId } });
      if (usedByIngredient.size > 0) {
        await tx.recipeItem.createMany({
          data: [...usedByIngredient.entries()].map(
            ([ingredientId, quantityUsed]) => ({
              productId: data.productId,
              ingredientId,
              quantityUsed,
            })
          ),
        });
      }

      await tx.product.update({
        where: { id: data.productId },
        data: {
          price: round2(pricing.sellingPrice),
          costPrice: round2(pricing.totalCost),
          pricingStrategy: data.mode,
          pricingValue: data.strategyValue,
        },
      });

      return pricing;
    });

    revalidatePath("/admin/ficha-tecnica");
    revalidatePath("/admin/receitas-base");
    revalidatePath("/admin/produtos");
    revalidatePath("/admin");
    revalidatePath("/");

    return {
      success: true,
      totalCost: result.totalCost,
      sellingPrice: result.sellingPrice,
      impacts: impacts.length > 0 ? impacts : undefined,
    };
  } catch (error) {
    console.error("saveFichaTecnica:", error);
    const message =
      error instanceof Error && error.message && !error.message.includes("\n")
        ? error.message
        : "Não foi possível salvar a ficha técnica.";
    return { error: message };
  }
}
