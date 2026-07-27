import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { applyMercadoPagoPaymentId } from "@/lib/payments/apply-approved-payment";

/**
 * Quando o cliente volta do Checkout Pro, o webhook pode atrasar.
 * Reconsulta o gateway e promove o pedido se estiver approved.
 */
export async function syncOrderPaymentFromGateway(params: {
  orderId: string;
  accessToken: string;
  paymentId: string;
}): Promise<{ status: string; paid: boolean }> {
  const order = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      paymentAccessToken: params.accessToken,
      source: "ONLINE",
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!order) {
    throw new Error("Pedido não encontrado.");
  }

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED
  ) {
    return { status: "approved", paid: true };
  }

  const result = await applyMercadoPagoPaymentId(params.paymentId);

  if (result.outcome === "paid" || result.outcome === "already_paid") {
    if (result.orderId !== order.id) {
      throw new Error("Pagamento não corresponde a este pedido.");
    }
    return { status: "approved", paid: true };
  }

  if (result.outcome === "amount_mismatch") {
    throw new Error("Valor do pagamento não confere com o pedido.");
  }

  if (result.outcome === "unmatched") {
    throw new Error(result.reason || "Pagamento não corresponde a este pedido.");
  }

  return {
    status: result.status,
    paid: false,
  };
}
