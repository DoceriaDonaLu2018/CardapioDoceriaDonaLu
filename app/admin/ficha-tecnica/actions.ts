"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import type { PricingMode, Unit } from "@/lib/pricing";

export type FichaActionState = {
  error?: string;
  success?: boolean;
};

export type SaveFichaIngredient = {
  ingredientId?: string;
  name: string;
  packagePrice: number;
  packageQuantity: number;
  unit: Unit;
  quantityUsed: number;
};

export type SaveFichaInput = {
  productId: string;
  mode: PricingMode;
  strategyValue: number;
  sellingPrice: number;
  totalCost: number;
  ingredients: SaveFichaIngredient[];
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export async function saveFichaTecnica(
  input: SaveFichaInput
): Promise<FichaActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (!input.productId) {
    return { error: "Selecione um produto para salvar a ficha técnica." };
  }

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });
  if (!product) {
    return { error: "Produto não encontrado." };
  }

  // Considera apenas ingredientes válidos (com nome e quantidade usada).
  const validLines = input.ingredients.filter(
    (line) => line.name.trim() && line.quantityUsed > 0
  );

  try {
    // Resolve/cria os ingredientes e mescla linhas duplicadas por ingrediente.
    const usedByIngredient = new Map<string, number>();

    for (const line of validLines) {
      const name = line.name.trim();

      const ingredient = await prisma.ingredient.upsert({
        where: line.ingredientId
          ? { id: line.ingredientId }
          : { name },
        update: {
          purchasePrice: line.packagePrice,
          purchaseQuantity: line.packageQuantity,
          unit: line.unit,
        },
        create: {
          name,
          purchasePrice: line.packagePrice,
          purchaseQuantity: line.packageQuantity,
          unit: line.unit,
        },
        select: { id: true },
      });

      usedByIngredient.set(
        ingredient.id,
        (usedByIngredient.get(ingredient.id) ?? 0) + line.quantityUsed
      );
    }

    await prisma.$transaction([
      prisma.recipeItem.deleteMany({ where: { productId: input.productId } }),
      ...[...usedByIngredient.entries()].map(([ingredientId, quantityUsed]) =>
        prisma.recipeItem.create({
          data: { productId: input.productId, ingredientId, quantityUsed },
        })
      ),
      prisma.product.update({
        where: { id: input.productId },
        data: {
          price: round2(input.sellingPrice),
          costPrice: round2(input.totalCost),
          pricingStrategy: input.mode,
          pricingValue: input.strategyValue,
        },
      }),
    ]);
  } catch (error) {
    console.error("saveFichaTecnica:", error);
    return { error: "Não foi possível salvar a ficha técnica." };
  }

  revalidatePath("/admin/ficha-tecnica");
  revalidatePath("/admin/produtos");
  revalidatePath("/admin");
  revalidatePath("/");

  return { success: true };
}
