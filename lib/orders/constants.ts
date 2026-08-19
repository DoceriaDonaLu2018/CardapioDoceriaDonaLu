/**
 * Status da state machine de pedidos.
 *
 * REGRA DE OURO (cozinha / painel) — a query real está em `kitchenEligibleWhere`:
 * - AWAITING_PAYMENT → NUNCA aparece na produção (PIX gerado, agendado ou pendente)
 * - REQUIRES_REFUND → pago no gateway mas sem estoque (alerta admin; fora da cozinha)
 * - PDV PENDING + releasedToKitchen → balcão
 * - ONLINE PAID + paymentId + paidAt + releasedToKitchen → online confirmado
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

/**
 * Status que *podem* aparecer na cozinha, mas NÃO são suficientes sozinhos.
 * Sempre combinar com `kitchenEligibleWhere` / `canReleaseOrderToKitchen`.
 */
export const KITCHEN_VISIBLE_STATUSES: OrderStatusValue[] = [
  OrderStatus.PENDING, // balcão / PDV
  OrderStatus.PAID, // checkout online pago — exige paymentId + flag
];

export const OrderSource = {
  PDV: "PDV",
  ONLINE: "ONLINE",
} as const;

export type OrderSourceValue = (typeof OrderSource)[keyof typeof OrderSource];

/** Valor fixo em deliveryAddress enquanto a doceria não faz entregas. */
export const PICKUP_FULFILLMENT_LABEL = "Retirada no local";
