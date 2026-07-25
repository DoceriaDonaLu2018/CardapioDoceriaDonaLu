import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { PixPaymentClient } from "./pix-payment-client";

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
      pixCopyPaste: true,
      pixQrCodeBase64: true,
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

  if (!order.pixCopyPaste) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <h1 className="font-serif text-2xl font-bold text-stone-800">
            PIX indisponível
          </h1>
          <p className="mt-2 text-stone-500">
            Não encontramos o código PIX deste pedido. Tente novamente no
            checkout.
          </p>
          <Link
            href="/checkout"
            className="mt-6 inline-block text-coffee-700 underline-offset-2 hover:underline"
          >
            Ir para o checkout
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 py-10">
      <div className="container">
        <PixPaymentClient
          orderId={order.id}
          accessToken={order.paymentAccessToken}
          totalAmount={order.totalAmount}
          pixCopyPaste={order.pixCopyPaste}
          pixQrCodeBase64={order.pixQrCodeBase64}
          customerName={order.customerName}
        />
      </div>
    </div>
  );
}
