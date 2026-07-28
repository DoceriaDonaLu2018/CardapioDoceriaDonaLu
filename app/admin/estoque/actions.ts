"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  stockAdjustSchema,
  stockBulkUpdateSchema,
} from "@/lib/validation/safe-input";

export type StockActionState = {
  error?: string;
  success?: boolean;
  stockQuantity?: number;
  /** Quantidade de produtos atualizados no lote. */
  updatedCount?: number;
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

/**
 * Atualiza estoque de vários produtos de forma atômica.
 * Segurança: requireAdmin + Zod (inteiros ≥ 0) + $transaction (tudo ou nada)
 * + só produtos não deletados + IDs devem existir (senão falha e reverte).
 */
export async function bulkUpdateProductStock(
  updates: unknown
): Promise<StockActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = stockBulkUpdateSchema.safeParse(updates);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Dados de estoque em lote inválidos.",
    };
  }

  // Deduplica por id (último valor vence) — evita updates conflitantes no mesmo produto.
  const byId = new Map<string, number>();
  for (const item of parsed.data) {
    byId.set(item.id, item.newStock);
  }
  const uniqueUpdates = [...byId.entries()].map(([id, newStock]) => ({
    id,
    newStock,
  }));

  try {
    const existing = await prisma.product.findMany({
      where: {
        id: { in: uniqueUpdates.map((u) => u.id) },
        isDeleted: false,
      },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));

    if (existingIds.size !== uniqueUpdates.length) {
      return {
        error:
          "Um ou mais produtos selecionados não existem mais. Recarregue a página.",
      };
    }

    await prisma.$transaction(async (tx) => {
      for (const item of uniqueUpdates) {
        const result = await tx.product.updateMany({
          where: { id: item.id, isDeleted: false },
          data: { stockQuantity: item.newStock },
        });
        if (result.count === 0) {
          // Qualquer falha aborta a transação → nada é persistido.
          throw new Error(`Produto inválido ou removido: ${item.id}`);
        }
      }
    });

    revalidateStock();
    return {
      success: true,
      updatedCount: uniqueUpdates.length,
    };
  } catch (error) {
    console.error("bulkUpdateProductStock:", error);
    return { error: "Não foi possível atualizar o estoque em lote." };
  }
}
