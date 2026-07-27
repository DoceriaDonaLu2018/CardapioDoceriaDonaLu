import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { fetchMercadoPagoPayment } from "@/lib/payments/mercadopago";

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02;
}

/**
 * Quando o cliente volta do Checkout Pro, o webhook pode atrasar.
 * Reconsulta o pagamento no gateway e promove o pedido se estiver approved.
 */
export async function syncOrderPaymentFromGateway(params: {
  orderId: string;
  accessToken: string;
  paymentId: string;
}): Promise<{
  status: string;
  paid: boolean;
  paymentMethodId: string | null;
}> {
  const order = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      paymentAccessToken: params.accessToken,
      source: "ONLINE",
    },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      paymentId: true,
    },
  });

  if (!order) {
    throw new Error("Pedido não encontrado.");
  }

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED
  ) {
    return { status: "approved", paid: true, paymentMethodId: null };
  }

  const payment = await fetchMercadoPagoPayment(params.paymentId);

  if (
    payment.externalReference &&
    payment.externalReference !== order.id
  ) {
    throw new Error("Pagamento não corresponde a este pedido.");
  }

  if (!amountsMatch(payment.amount, order.totalAmount)) {
    throw new Error("Valor do pagamento não confere com o pedido.");
  }

  if (payment.status === "approved") {
    await prisma.order.updateMany({
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
    return {
      status: payment.status,
      paid: true,
      paymentMethodId: payment.paymentMethodId,
    };
  }

  return {
    status: payment.status,
    paid: false,
    paymentMethodId: payment.paymentMethodId,
  };
}
