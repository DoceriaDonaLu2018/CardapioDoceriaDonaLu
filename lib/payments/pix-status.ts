/**
 * Estados internos do PIX transparente — isolados do Checkout Pro.
 * A promoção do pedido (AWAITING_PAYMENT → PAID) NÃO vive aqui.
 */

export const PixPaymentStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
  REFUNDED: "refunded",
} as const;

export type PixPaymentStatusValue =
  (typeof PixPaymentStatus)[keyof typeof PixPaymentStatus];

const TERMINAL_MP = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "refunded",
  "charged_back",
]);

/** Mapeia status do Mercado Pago para o status persistido em Payment. */
export function mapMercadoPagoStatusToPix(
  mpStatus: string
): PixPaymentStatusValue {
  const status = mpStatus.trim().toLowerCase();
  if (status === "approved") return PixPaymentStatus.APPROVED;
  if (status === "refunded" || status === "charged_back") {
    return PixPaymentStatus.REFUNDED;
  }
  if (status === "rejected") return PixPaymentStatus.REJECTED;
  if (status === "cancelled" || status === "canceled") {
    return PixPaymentStatus.CANCELLED;
  }
  return PixPaymentStatus.PENDING;
}

export function isTerminalMercadoPagoStatus(mpStatus: string): boolean {
  return TERMINAL_MP.has(mpStatus.trim().toLowerCase());
}

export function isPixExpired(
  expiresAt: Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= nowMs;
}

/**
 * Política: um PIX pendente ainda pode ser exibido se não expirou.
 * Pagamento aprovado no gateway nunca é tratado como expirado aqui —
 * a confirmação oficial é o webhook + GET /v1/payments.
 */
export function isPixReusable(params: {
  status: string;
  expiresAt: Date | null | undefined;
  nowMs?: number;
}): boolean {
  if (params.status !== PixPaymentStatus.PENDING) return false;
  return !isPixExpired(params.expiresAt, params.nowMs ?? Date.now());
}

export function splitPayerName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = (parts[0] || "Cliente").slice(0, 60);
  const lastName = (parts.slice(1).join(" ") || firstName).slice(0, 60);
  return { firstName, lastName };
}
