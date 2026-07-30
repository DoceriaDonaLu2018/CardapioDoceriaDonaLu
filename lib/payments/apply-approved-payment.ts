import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import {
  decrementStockOrThrow,
  InsufficientStockError,
} from "@/lib/inventory/stock";
import { fetchMercadoPagoPayment } from "@/lib/payments/mercadopago";

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02;
}

export type ApplyPaymentResult =
  | { outcome: "paid"; orderId: string; paymentId: string }
  | { outcome: "already_paid"; orderId: string; paymentId: string }
  | { outcome: "pending"; orderId: string | null; paymentId: string; status: string }
  | { outcome: "rejected"; orderId: string | null; paymentId: string; status: string }
  | { outcome: "unmatched"; paymentId: string; reason: string }
  | { outcome: "amount_mismatch"; orderId: string; paymentId: string }
  | { outcome: "stock_failed"; orderId: string; paymentId: string };

/**
 * Fonte da verdade: GET /v1/payments/{id} → promove AWAITING_PAYMENT → PAID.
 * Idempotente: seguro chamar várias vezes com o mesmo paymentId.
 *
 * Estoque: pedidos com stockReserved=true já reservaram na criação — só promove status.
 * Legado (stockReserved=false): baixa atômica nesta transaction (compat).
 */
export async function applyMercadoPagoPaymentId(
  paymentId: string
): Promise<ApplyPaymentResult> {
  const payment = await fetchMercadoPagoPayment(paymentId);
  const orderId = payment.externalReference?.trim() || null;

  if (payment.status !== "approved") {
    const terminal = [
      "rejected",
      "cancelled",
      "canceled",
      "refunded",
      "charged_back",
    ].includes(payment.status);

    return {
      outcome: terminal ? "rejected" : "pending",
      orderId,
      paymentId: payment.id,
      status: payment.status,
    };
  }

  if (!orderId) {
    return {
      outcome: "unmatched",
      paymentId: payment.id,
      reason: "external_reference ausente",
    };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      paymentId: true,
      stockReserved: true,
    },
  });

  if (!order) {
    return {
      outcome: "unmatched",
      paymentId: payment.id,
      reason: `pedido ${orderId} não encontrado`,
    };
  }

  if (!amountsMatch(payment.amount, order.totalAmount)) {
    console.error("applyMercadoPagoPaymentId amount mismatch", {
      orderId: order.id,
      expected: order.totalAmount,
      got: payment.amount,
      paymentId: payment.id,
    });
    return {
      outcome: "amount_mismatch",
      orderId: order.id,
      paymentId: payment.id,
    };
  }

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED
  ) {
    // Já pago — garante paymentId se ainda não tinha.
    if (!order.paymentId) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentId: payment.id,
          paymentMethod: payment.paymentMethodId ?? undefined,
          paidAt: new Date(),
        },
      });
    }
    return {
      outcome: "already_paid",
      orderId: order.id,
      paymentId: payment.id,
    };
  }

  if (order.status !== OrderStatus.AWAITING_PAYMENT) {
    return {
      outcome: "unmatched",
      paymentId: payment.id,
      reason: `status atual ${order.status} não é AWAITING_PAYMENT`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Unique em paymentId: se outro pedido já usa este id, falha com P2002.
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.AWAITING_PAYMENT,
        },
        data: {
          status: OrderStatus.PAID,
          paymentId: payment.id,
          paymentMethod: payment.paymentMethodId ?? "checkout_pro",
          paidAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new Error("ORDER_NOT_UPDATED");
      }

      // Reserva já feita no createOnlineOrder — evita cobrado+não-pago por race.
      if (!order.stockReserved) {
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
          select: { productId: true, quantity: true },
        });

        for (const item of items) {
          await decrementStockOrThrow(tx, item.productId, item.quantity);
        }
      }
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      console.error("applyMercadoPagoPaymentId stock_failed", {
        orderId: order.id,
        paymentId: payment.id,
        productId: error.productId,
      });
      return {
        outcome: "stock_failed",
        orderId: order.id,
        paymentId: payment.id,
      };
    }

    if (error instanceof Error && error.message === "ORDER_NOT_UPDATED") {
      const refreshed = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      if (
        refreshed?.status === OrderStatus.PAID ||
        refreshed?.status === OrderStatus.COMPLETED
      ) {
        return {
          outcome: "already_paid",
          orderId: order.id,
          paymentId: payment.id,
        };
      }
      return {
        outcome: "unmatched",
        paymentId: payment.id,
        reason: "updateMany não alterou linhas",
      };
    }

    throw error;
  }

  return {
    outcome: "paid",
    orderId: order.id,
    paymentId: payment.id,
  };
}

/** Busca payments de uma merchant_order (Checkout Pro). */
export async function fetchMerchantOrderPaymentIds(
  merchantOrderId: string
): Promise<string[]> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }

  const response = await fetch(
    `https://api.mercadopago.com/merchant_orders/${merchantOrderId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  const data = (await response.json()) as {
    id?: number | string;
    payments?: Array<{ id?: number | string; status?: string }>;
  };

  if (!response.ok || data.id == null) {
    throw new Error("Não foi possível obter a merchant_order no gateway.");
  }

  return (data.payments ?? [])
    .map((p) => (p.id != null ? String(p.id) : null))
    .filter((id): id is string => Boolean(id));
}
