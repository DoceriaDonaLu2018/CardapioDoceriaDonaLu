import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { PaymentCheckoutClient } from "./payment-checkout-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function PagarPedidoPage({
  params,
  searchParams,
}: PageProps) {
  const { orderId } = await params;
  const { token } = await searchParams;

  if (!token) notFound();

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      paymentAccessToken: token,
      source: "ONLINE",
    },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      customerName: true,
      paymentAccessToken: true,
    },
  });

  if (!order || !order.paymentAccessToken) notFound();

  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED
  ) {
    redirect(
      `/pedido/${order.id}/sucesso?token=${encodeURIComponent(order.paymentAccessToken)}`
    );
  }

  if (order.status === OrderStatus.CANCELED) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <h1 className="font-serif text-2xl font-bold text-stone-800">
            Pedido cancelado
          </h1>
          <p className="mt-2 text-stone-500">
            Este pedido não está mais disponível para pagamento.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-coffee-700 underline-offset-2 hover:underline"
          >
            Voltar ao cardápio
          </Link>
        </div>
      </div>
    );
  }

  const publicKey =
    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim() || null;

  return (
    <div className="min-h-screen bg-stone-50 py-10">
      <div className="container">
        <PaymentCheckoutClient
          orderId={order.id}
          accessToken={order.paymentAccessToken}
          totalAmount={order.totalAmount}
          customerName={order.customerName}
          publicKey={publicKey}
        />
      </div>
    </div>
  );
}
