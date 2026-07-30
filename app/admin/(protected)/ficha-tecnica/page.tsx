import { prisma } from "@/lib/prisma";
import { FichaTecnicaClient } from "./ficha-tecnica-client";

export const dynamic = "force-dynamic";

export default async function FichaTecnicaPage() {
  const [products, ingredients, baseRecipes, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        price: true,
        pricingStrategy: true,
        pricingValue: true,
        categoryId: true,
        recipeItems: {
          select: {
            quantityUsed: true,
            ingredient: {
              select: {
                id: true,
                name: true,
                purchasePrice: true,
                purchaseQuantity: true,
                unit: true,
                wastePercent: true,
              },
            },
          },
        },
        technicalSheet: {
          select: {
            desiredMarkupPercent: true,
            lines: {
              orderBy: { sortOrder: "asc" },
              select: {
                componentType: true,
                quantityUsed: true,
                baseRecipeId: true,
                ingredient: {
                  select: {
                    id: true,
                    name: true,
                    purchasePrice: true,
                    purchaseQuantity: true,
                    unit: true,
                    wastePercent: true,
                  },
                },
              },
            },
            dynamicCosts: {
              orderBy: { sortOrder: "asc" },
              select: { name: true, kind: true, value: true },
            },
          },
        },
      },
    }),
    prisma.ingredient.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        purchasePrice: true,
        purchaseQuantity: true,
        unit: true,
        wastePercent: true,
      },
    }),
    prisma.baseRecipe.findMany({
      orderBy: { name: "asc" },
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
    }),
    prisma.category.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Ficha Técnica
        </h1>
        <p className="mt-1 text-stone-500">
          Custo com matérias-primas, receitas base, fator de correção e custos
          dinâmicos — recalculado com segurança no servidor.
        </p>
      </div>

      <FichaTecnicaClient
        products={products.map((p) => ({
          ...p,
          technicalSheet: p.technicalSheet
            ? {
                desiredMarkupPercent: p.technicalSheet.desiredMarkupPercent,
                dynamicCosts: p.technicalSheet.dynamicCosts,
                lines: p.technicalSheet.lines
                  .map((line) => {
                    if (
                      line.componentType === "BASE_RECIPE" &&
                      line.baseRecipeId
                    ) {
                      return {
                        componentType: "BASE_RECIPE" as const,
                        quantityUsed: line.quantityUsed,
                        baseRecipeId: line.baseRecipeId,
                      };
                    }
                    if (line.ingredient) {
                      return {
                        componentType: "INGREDIENT" as const,
                        quantityUsed: line.quantityUsed,
                        ingredient: line.ingredient,
                      };
                    }
                    return null;
                  })
                  .filter((l): l is NonNullable<typeof l> => l != null),
              }
            : null,
        }))}
        ingredients={ingredients}
        baseRecipes={baseRecipes.map((r) => ({
          id: r.id,
          name: r.name,
          yieldQuantity: r.yieldQuantity,
          yieldUnit: r.yieldUnit,
          unitCostCache: r.unitCostCache,
          items: r.items.map((item) =>
            item.componentType === "BASE_RECIPE" && item.nestedBaseRecipeId
              ? {
                  componentType: "BASE_RECIPE" as const,
                  nestedBaseRecipeId: item.nestedBaseRecipeId,
                  quantityUsed: item.quantityUsed,
                }
              : {
                  componentType: "INGREDIENT" as const,
                  ingredientId: item.ingredientId ?? "",
                  quantityUsed: item.quantityUsed,
                }
          ),
        }))}
        categories={categories}
      />
    </div>
  );
}
