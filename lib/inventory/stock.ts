import type { Prisma } from "@prisma/client";

export class InsufficientStockError extends Error {
  constructor(public readonly productId: string) {
    super(`Estoque insuficiente para o produto ${productId}`);
    this.name = "InsufficientStockError";
  }
}

type TxClient = Prisma.TransactionClient;

/**
 * Baixa atômica: só decrementa se stockQuantity >= quantity.
 * Lança InsufficientStockError se a linha não for atualizada (race / esgotado).
 */
export async function decrementStockOrThrow(
  tx: TxClient,
  productId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;

  const result = await tx.product.updateMany({
    where: {
      id: productId,
      isDeleted: false,
      stockQuantity: { gte: quantity },
    },
    data: {
      stockQuantity: { decrement: quantity },
    },
  });

  if (result.count === 0) {
    throw new InsufficientStockError(productId);
  }
}

/** Devolve unidades ao estoque (ex.: reedição de pedido PDV). */
export async function incrementStock(
  tx: TxClient,
  productId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;

  await tx.product.updateMany({
    where: { id: productId, isDeleted: false },
    data: { stockQuantity: { increment: quantity } },
  });
}
