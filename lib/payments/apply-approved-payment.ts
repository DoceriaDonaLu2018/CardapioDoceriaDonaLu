import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import {
  decrementStockOrThrow,
  incrementStock,
  InsufficientStockError,
} from "@/lib/inventory/stock";
import {
  fetchMercadoPagoPayment,
  parseMercadoPagoResourceId,
} from "@/lib/payments/mercadopago";
import {
  cancelPendingPixForOrder,
  syncPixPaymentRecord,
} from "@/lib/payments/pix";

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02;
}

const REFUND_STATUSES = new Set(["refunded", "charged_back"]);

/**
 * Estorno/chargeback confirmado no gateway: tira da cozinha se ainda está PAID.
 * COMPLETED (já entregue) não é revertido automaticamente.
 * Idempotente via updateMany condicional.
 */
async function reversePaidOrderIfNeeded(
  orderId: string,
  paymentId: string,
  mpStatus: string
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      items: { select: { productId: true, quantity: true } },
    },
  });

  if (!order) return false;

  if (order.status === OrderStatus.COMPLETED) {
    console.error("applyMercadoPagoPaymentId refund after COMPLETED", {
      orderId,
      paymentId,
      mpStatus,
    });
    return false;
  }

  if (order.status === OrderStatus.REQUIRES_REFUND) {
    const claimed = await prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.REQUIRES_REFUND },
      data: { status: OrderStatus.CANCELED, stockReserved: false },
    });
    return claimed.count > 0;
  }

  if (order.status !== OrderStatus.PAID) return false;

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PAID },
      data: { status: OrderStatus.CANCELED, stockReserved: false },
    });
    if (claimed.count === 0) return false;

    const qtyByProduct = new Map<string, number>();
    for (const item of order.items) {
      qtyByProduct.set(
        item.productId,
        (qtyByProduct.get(item.productId) ?? 0) + item.quantity
      );
    }
    for (const [productId, quantity] of qtyByProduct) {
      await incrementStock(tx, productId, quantity);
    }
    return true;
  });
}

export type ApplyPaymentResult =
  | { outcome: "paid"; orderId: string; paymentId: string }
  | { outcome: "already_paid"; orderId: string; paymentId: string }
  | { outcome: "pending"; orderId: string | null; paymentId: string; status: string }
  | { outcome: "rejected"; orderId: string | null; paymentId: string; status: string }
  | { outcome: "unmatched"; paymentId: string; reason: string }
  | { outcome: "amount_mismatch"; orderId: string; paymentId: string }
  | {
      outcome: "requires_refund";
      orderId: string;
      paymentId: string;
      productId: string;
    }
  | {
      outcome: "reversed";
      orderId: string;
      paymentId: string;
      status: string;
    };

/**
 * Fonte da verdade: GET /v1/payments/{id} → promove AWAITING_PAYMENT → PAID.
 * Idempotente: seguro chamar várias vezes com o mesmo paymentId.
 *
 * Estoque: baixa ATÔMICA nesta transaction no approved (não no create do checkout).
 * Exceção: pedidos legado com stockReserved=true (já baixaram na criação).
 * Se a baixa falhar após cobrança: status REQUIRES_REFUND (não deixa estoque negativo).
 */
export async function applyMercadoPagoPaymentId(
  paymentId: string
): Promise<ApplyPaymentResult> {
  const safePaymentId = parseMercadoPagoResourceId(paymentId);
  if (!safePaymentId) {
    return {
      outcome: "unmatched",
      paymentId: String(paymentId).slice(0, 32),
      reason: "payment_id inválido",
    };
  }

  const payment = await fetchMercadoPagoPayment(safePaymentId);
  const orderId = payment.externalReference?.trim() || null;

  await syncPixPaymentRecord({
    providerPaymentId: payment.id,
    mpStatus: payment.status,
    statusDetail: payment.statusDetail,
    orderId,
  }).catch((error) => {
    console.error("applyMercadoPagoPaymentId sync PIX record", {
      paymentId: payment.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  });

  if (payment.status !== "approved") {
    const terminal = [
      "rejected",
      "cancelled",
      "canceled",
      "refunded",
      "charged_back",
    ].includes(payment.status);

    if (REFUND_STATUSES.has(payment.status) && orderId) {
      const reversed = await reversePaidOrderIfNeeded(
        orderId,
        payment.id,
        payment.status
      );
      if (reversed) {
        console.error("applyMercadoPagoPaymentId order reversed (refund/chargeback)", {
          orderId,
          paymentId: payment.id,
          status: payment.status,
        });
        return {
          outcome: "reversed",
          orderId,
          paymentId: payment.id,
          status: payment.status,
        };
      }
    }

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
    try {
      await cancelPendingPixForOrder(order.id, payment.id);
    } catch (error) {
      console.error("applyMercadoPagoPaymentId cancel leftover PIX", {
        orderId: order.id,
        paymentId: payment.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    return {
      outcome: "already_paid",
      orderId: order.id,
      paymentId: payment.id,
    };
  }

  if (order.status === OrderStatus.REQUIRES_REFUND) {
    // Já marcado — idempotente (pagamento aprovado sem estoque).
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
      outcome: "requires_refund",
      orderId: order.id,
      paymentId: payment.id,
      productId: "unknown",
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
          stockReserved: true,
        },
      });

      if (updated.count === 0) {
        throw new Error("ORDER_NOT_UPDATED");
      }

      // Legado: já baixou no create — não decrementa de novo.
      if (!order.stockReserved) {
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
          select: { productId: true, quantity: true },
        });

        // Agrega por produto (mods diferentes = mesmo SKU).
        const qtyByProduct = new Map<string, number>();
        for (const item of items) {
          qtyByProduct.set(
            item.productId,
            (qtyByProduct.get(item.productId) ?? 0) + item.quantity
          );
        }

        for (const [productId, quantity] of qtyByProduct) {
          // updateMany com gte → nunca deixa estoque negativo (race A/B).
          await decrementStockOrThrow(tx, productId, quantity);
        }
      }
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      console.error("applyMercadoPagoPaymentId requires_refund", {
        orderId: order.id,
        paymentId: payment.id,
        productId: error.productId,
      });

      // Transaction de PAID+stock fez rollback. Marca alerta SEM baixar estoque.
      await prisma.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.AWAITING_PAYMENT,
        },
        data: {
          status: OrderStatus.REQUIRES_REFUND,
          paymentId: payment.id,
          paymentMethod: payment.paymentMethodId ?? "checkout_pro",
          paidAt: new Date(),
          stockReserved: false,
        },
      });

      return {
        outcome: "requires_refund",
        orderId: order.id,
        paymentId: payment.id,
        productId: error.productId,
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
      if (refreshed?.status === OrderStatus.REQUIRES_REFUND) {
        return {
          outcome: "requires_refund",
          orderId: order.id,
          paymentId: payment.id,
          productId: "unknown",
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

  try {
    await cancelPendingPixForOrder(order.id, payment.id);
  } catch (error) {
    console.error("applyMercadoPagoPaymentId cancel leftover PIX", {
      orderId: order.id,
      paymentId: payment.id,
      error: error instanceof Error ? error.message : "unknown",
    });
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
  const safeId = parseMercadoPagoResourceId(merchantOrderId);
  if (!safeId) {
    throw new Error("ID de merchant_order inválido.");
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }

  const response = await fetch(
    `https://api.mercadopago.com/merchant_orders/${safeId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
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
    .map((p) => parseMercadoPagoResourceId(p.id))
    .filter((id): id is string => Boolean(id));
}
