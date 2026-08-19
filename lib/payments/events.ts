/**
 * Logs estruturados do fluxo financeiro.
 * Nunca receber Access Token, webhook secret, CPF ou DATABASE_URL.
 */
export const PaymentLogEvent = {
  PIX_CREATE_STARTED: "PIX_CREATE_STARTED",
  PIX_CREATE_SUCCESS: "PIX_CREATE_SUCCESS",
  PIX_CREATE_FAILED: "PIX_CREATE_FAILED",
  PAYMENT_WEBHOOK_RECEIVED: "PAYMENT_WEBHOOK_RECEIVED",
  PAYMENT_WEBHOOK_VALIDATED: "PAYMENT_WEBHOOK_VALIDATED",
  PAYMENT_WEBHOOK_REJECTED: "PAYMENT_WEBHOOK_REJECTED",
  PAYMENT_FETCHED: "PAYMENT_FETCHED",
  PAYMENT_VALIDATED: "PAYMENT_VALIDATED",
  PAYMENT_APPROVED: "PAYMENT_APPROVED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  ORDER_PAYMENT_CONFIRMED: "ORDER_PAYMENT_CONFIRMED",
  ORDER_RELEASED_TO_KITCHEN: "ORDER_RELEASED_TO_KITCHEN",
} as const;

export type PaymentLogEventName =
  (typeof PaymentLogEvent)[keyof typeof PaymentLogEvent];

export type PaymentLogFields = {
  orderId?: string | null;
  paymentId?: string | null;
  requestId?: string | null;
  status?: string | null;
  result?: string | null;
};

export function logPaymentEvent(
  event: PaymentLogEventName,
  fields: PaymentLogFields = {},
  level: "info" | "warn" | "error" = "info"
): void {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    orderId: fields.orderId ?? null,
    paymentId: fields.paymentId ?? null,
    requestId: fields.requestId ?? null,
    status: fields.status ?? null,
    result: fields.result ?? null,
  };

  if (level === "error") {
    console.error(event, payload);
    return;
  }
  if (level === "warn") {
    console.warn(event, payload);
    return;
  }
  console.info(event, payload);
}
