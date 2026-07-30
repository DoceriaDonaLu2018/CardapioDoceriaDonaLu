import { prisma } from "@/lib/prisma";
import { ReceitasBaseClient } from "./receitas-base-client";

export const dynamic = "force-dynamic";

export default async function ReceitasBasePage() {
  const [recipes, ingredients] = await Promise.all([
    prisma.baseRecipe.findMany({
      orderBy: { name: "asc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            ingredient: { select: { name: true } },
            nestedBaseRecipe: { select: { name: true } },
          },
        },
      },
    }),
    prisma.ingredient.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Receitas base
        </h1>
        <p className="mt-1 text-stone-500">
          Massas, recheios e intermediários com rendimento e custo unitário.
          Use-as na ficha técnica do produto final.
        </p>
      </div>

      <ReceitasBaseClient
        recipes={recipes.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          yieldQuantity: r.yieldQuantity,
          yieldUnit: r.yieldUnit,
          unitCostCache: r.unitCostCache,
          totalCostCache: r.totalCostCache,
          items: r.items.map((item) => ({
            componentType: item.componentType,
            quantityUsed: item.quantityUsed,
            ingredientId: item.ingredientId,
            nestedBaseRecipeId: item.nestedBaseRecipeId,
            ingredientName: item.ingredient?.name ?? null,
            nestedName: item.nestedBaseRecipe?.name ?? null,
          })),
        }))}
        ingredients={ingredients}
      />
    </div>
  );
}
