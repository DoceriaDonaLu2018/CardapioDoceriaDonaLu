/**
 * Status da state machine de pedidos.
 *
 * REGRA DE OURO (cozinha / painel):
 * - AWAITING_PAYMENT → NUNCA aparece na produção
 * - PAID | PENDING    → prontos para preparo/impressão
 */
export const OrderStatus = {
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  PAID: "PAID",
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
} as const;

export type OrderStatusValue =
  (typeof OrderStatus)[keyof typeof OrderStatus];

/** Pedidos que a cozinha / badge / auto-impressão devem enxergar. */
export const KITCHEN_VISIBLE_STATUSES: OrderStatusValue[] = [
  OrderStatus.PENDING, // balcão / PDV
  OrderStatus.PAID, // checkout online pago via PIX
];

export const OrderSource = {
  PDV: "PDV",
  ONLINE: "ONLINE",
} as const;

export type OrderSourceValue = (typeof OrderSource)[keyof typeof OrderSource];
