"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  adminModifierGroupsSchema,
} from "@/lib/modifiers/types";
import { idSchema } from "@/lib/validation/safe-input";

export type ModifierActionState = {
  error?: string;
  success?: boolean;
};

function revalidateProducts() {
  revalidatePath("/admin/produtos");
  revalidatePath("/");
}

/**
 * Substitui todos os grupos/opções do produto (transação atômica).
 * Segurança: requireAdmin + Zod; Cascade remove opções órfãs.
 */
export async function saveProductModifiers(
  productId: string,
  rawGroups: unknown
): Promise<ModifierActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(productId);
  if (!parsedId.success) return { error: "Produto inválido." };

  const parsed = adminModifierGroupsSchema.safeParse(rawGroups ?? []);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados de variações inválidos.",
    };
  }

  try {
    const product = await prisma.product.findFirst({
      where: { id: parsedId.data, isDeleted: false },
      select: { id: true },
    });
    if (!product) return { error: "Produto não encontrado." };

    await prisma.$transaction(async (tx) => {
      await tx.productModifierGroup.deleteMany({
        where: { productId: product.id },
      });

      for (let gi = 0; gi < parsed.data.length; gi++) {
        const group = parsed.data[gi];
        await tx.productModifierGroup.create({
          data: {
            productId: product.id,
            name: group.name,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder ?? gi,
            options: {
              create: group.options.map((opt, oi) => ({
                name: opt.name,
                price: opt.price,
                maxQuantityPerOption: opt.maxQuantityPerOption,
                sortOrder: opt.sortOrder ?? oi,
              })),
            },
          },
        });
      }
    });

    revalidateProducts();
    return { success: true };
  } catch (error) {
    console.error("saveProductModifiers:", error);
    return { error: "Não foi possível salvar as variações." };
  }
}
