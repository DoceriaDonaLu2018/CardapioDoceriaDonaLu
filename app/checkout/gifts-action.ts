"use server";

import { prisma } from "@/lib/prisma";

/** Brindes ativos para exibir no drawer do carrinho (somente leitura). */
export async function getActiveGiftsForCart(): Promise<
  Array<{
    id: string;
    name: string;
    minPurchaseValue: number;
    imageUrl: string | null;
  }>
> {
  return prisma.gift.findMany({
    where: { isActive: true },
    orderBy: { minPurchaseValue: "asc" },
    select: {
      id: true,
      name: true,
      minPurchaseValue: true,
      imageUrl: true,
    },
  });
}
