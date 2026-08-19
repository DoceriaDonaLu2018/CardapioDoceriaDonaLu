import { prisma } from "@/lib/prisma";

export const PaymentAuditEvent = {
  PAYMENT_CREATED: "PAYMENT_CREATED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAYMENT_APPROVED: "PAYMENT_APPROVED",
  PAYMENT_REJECTED: "PAYMENT_REJECTED",
  PAYMENT_CANCELLED: "PAYMENT_CANCELLED",
  PAYMENT_UNMATCHED: "PAYMENT_UNMATCHED",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  ORDER_RELEASED_TO_KITCHEN: "ORDER_RELEASED_TO_KITCHEN",
} as const;

export type PaymentAuditEventValue =
  (typeof PaymentAuditEvent)[keyof typeof PaymentAuditEvent];

/**
 * Log financeiro append-only. Nunca receber secrets, CPF ou Access Token.
 */
export async function recordPaymentAudit(params: {
  event: PaymentAuditEventValue | string;
  origin: string;
  result: string;
  orderId?: string | null;
  paymentId?: string | null;
  correlationId?: string | null;
}): Promise<void> {
  try {
    await prisma.paymentAuditLog.create({
      data: {
        event: params.event.slice(0, 80),
        origin: params.origin.slice(0, 40),
        result: params.result.slice(0, 240),
        orderId: params.orderId ?? null,
        paymentId: params.paymentId ?? null,
        correlationId: params.correlationId?.slice(0, 80) ?? null,
      },
    });
  } catch (error) {
    console.error("payment audit log failed", {
      event: params.event,
      orderId: params.orderId,
      paymentId: params.paymentId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
