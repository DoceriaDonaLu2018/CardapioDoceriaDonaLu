/**
 * Status da state machine de pedidos.
 *
 * REGRA DE OURO (cozinha / painel):
 * - AWAITING_PAYMENT → NUNCA aparece na produção
 * - REQUIRES_REFUND → pago no gateway mas sem estoque (alerta admin; fora da cozinha)
 * - PAID | PENDING    → prontos para preparo/impressão
 */
export const OrderStatus = {
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  PAID: "PAID",
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
  /** Pagamento approved no MP, mas baixa de estoque falhou (race). Exige estorno/contato. */
  REQUIRES_REFUND: "REQUIRES_REFUND",
} as const;

export type OrderStatusValue =
  (typeof OrderStatus)[keyof typeof OrderStatus];

/** Pedidos que a cozinha / badge / auto-impressão devem enxergar. */
export const KITCHEN_VISIBLE_STATUSES: OrderStatusValue[] = [
  OrderStatus.PENDING, // balcão / PDV
  OrderStatus.PAID, // checkout online pago (Checkout Pro)
];

export const OrderSource = {
  PDV: "PDV",
  ONLINE: "ONLINE",
} as const;

export type OrderSourceValue = (typeof OrderSource)[keyof typeof OrderSource];

/** Valor fixo em deliveryAddress enquanto a doceria não faz entregas. */
export const PICKUP_FULFILLMENT_LABEL = "Retirada no local";
