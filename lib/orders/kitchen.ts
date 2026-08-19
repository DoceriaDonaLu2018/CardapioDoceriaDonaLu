import type { Prisma } from "@prisma/client";

import { OrderSource, OrderStatus } from "@/lib/orders/constants";

export type KitchenEligibilityInput = {
  source: string;
  status: string;
  paymentId?: string | null;
  paidAt?: Date | string | null;
  releasedToKitchen: boolean;
};

/**
 * Única fonte de verdade: o pedido pode aparecer na cozinha?
 *
 * FAIL CLOSED — qualquer combinação desconhecida ou incompleta retorna false.
 *
 * PDV: pagamento no balcão (PENDING) + flag de liberação.
 * ONLINE: somente PAID com paymentId + paidAt + flag, após confirmação do gateway.
 */
export function canReleaseOrderToKitchen(
  order: KitchenEligibilityInput
): boolean {
  if (!order.releasedToKitchen) return false;

  if (order.source === OrderSource.PDV) {
    return order.status === OrderStatus.PENDING;
  }

  if (order.source === OrderSource.ONLINE) {
    return (
      order.status === OrderStatus.PAID &&
      Boolean(order.paymentId) &&
      Boolean(order.paidAt)
    );
  }

  return false;
}

/**
 * Predicado Prisma equivalente a `canReleaseOrderToKitchen`.
 * Usar em TODAS as queries da cozinha / auto-impressão / badge.
 */
export const kitchenEligibleWhere: Prisma.OrderWhereInput = {
  releasedToKitchen: true,
  OR: [
    {
      source: OrderSource.PDV,
      status: OrderStatus.PENDING,
    },
    {
      source: OrderSource.ONLINE,
      status: OrderStatus.PAID,
      paymentId: { not: null },
      paidAt: { not: null },
    },
  ],
};
