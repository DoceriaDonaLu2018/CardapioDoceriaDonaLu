"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { stockAdjustSchema } from "@/lib/validation/safe-input";

export type StockActionState = {
  error?: string;
  success?: boolean;
  stockQuantity?: number;
};

function revalidateStock() {
  revalidatePath("/admin/estoque");
  revalidatePath("/admin/produtos");
  revalidatePath("/");
}

export async function setProductStock(
  productId: string,
  stockQuantity: number
): Promise<StockActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = stockAdjustSchema.safeParse({ productId, stockQuantity });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados de estoque inválidos.",
    };
  }

  try {
    const updated = await prisma.product.updateMany({
      where: { id: parsed.data.productId, isDeleted: false },
      data: { stockQuantity: parsed.data.stockQuantity },
    });

    if (updated.count === 0) {
      return { error: "Produto não encontrado." };
    }

    revalidateStock();
    return {
      success: true,
      stockQuantity: parsed.data.stockQuantity,
    };
  } catch (error) {
    console.error("setProductStock:", error);
    return { error: "Não foi possível atualizar o estoque." };
  }
}
