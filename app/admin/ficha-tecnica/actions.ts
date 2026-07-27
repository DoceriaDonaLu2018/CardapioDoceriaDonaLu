"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import type { PricingMode, Unit } from "@/lib/pricing";
import { fichaSaveSchema } from "@/lib/validation/safe-input";

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

  // Revalida no servidor (não confiar só no Zod do client).
  const parsed = fichaSaveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados da ficha inválidos.",
    };
  }

  const data = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    select: { id: true },
  });
  if (!product) {
    return { error: "Produto não encontrado." };
  }

  const validLines = data.ingredients.filter(
    (line) => line.name.trim() && line.quantityUsed > 0
  );

  try {
    const usedByIngredient = new Map<string, number>();

    // Preload em 1 query + writes em uma única transaction (elimina N+1 de upserts).
    await prisma.$transaction(async (tx) => {
      if (validLines.length > 0) {
        const ids = [
          ...new Set(
            validLines
              .map((line) => line.ingredientId)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const names = [
          ...new Set(validLines.map((line) => line.name.trim())),
        ];

        const orFilters = [
          ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
          ...(names.length > 0 ? [{ name: { in: names } }] : []),
        ];

        const existing =
          orFilters.length > 0
            ? await tx.ingredient.findMany({
                where: { OR: orFilters },
                select: { id: true, name: true },
              })
            : [];

        const byId = new Map(existing.map((row) => [row.id, row]));
        const byName = new Map(existing.map((row) => [row.name, row]));

        for (const line of validLines) {
          const name = line.name.trim();
          const known =
            (line.ingredientId ? byId.get(line.ingredientId) : undefined) ??
            byName.get(name);

          let ingredientId: string;

          if (known) {
            await tx.ingredient.update({
              where: { id: known.id },
              data: {
                name,
                purchasePrice: line.packagePrice,
                purchaseQuantity: line.packageQuantity,
                unit: line.unit,
              },
            });
            ingredientId = known.id;
            byName.delete(known.name);
            byName.set(name, { id: known.id, name });
            byId.set(known.id, { id: known.id, name });
          } else {
            const created = await tx.ingredient.create({
              data: {
                name,
                purchasePrice: line.packagePrice,
                purchaseQuantity: line.packageQuantity,
                unit: line.unit,
              },
              select: { id: true, name: true },
            });
            ingredientId = created.id;
            byId.set(created.id, created);
            byName.set(created.name, created);
          }

          usedByIngredient.set(
            ingredientId,
            (usedByIngredient.get(ingredientId) ?? 0) + line.quantityUsed
          );
        }
      }

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
          price: round2(data.sellingPrice),
          costPrice: round2(data.totalCost),
          pricingStrategy: data.mode,
          pricingValue: data.strategyValue,
        },
      });
    });
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
