import { prisma } from "@/lib/prisma";
import { FichaTecnicaClient } from "./ficha-tecnica-client";

export const dynamic = "force-dynamic";

export default async function FichaTecnicaPage() {
  const [products, ingredients] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        price: true,
        pricingStrategy: true,
        pricingValue: true,
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
              },
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
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Ficha Técnica
        </h1>
        <p className="mt-1 text-stone-500">
          Engenharia de cardápio: calcule custo, lucro e preço ideal em tempo
          real.
        </p>
      </div>

      <FichaTecnicaClient products={products} ingredients={ingredients} />
    </div>
  );
}
