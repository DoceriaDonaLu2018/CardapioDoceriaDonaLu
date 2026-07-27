import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock3, RefreshCw } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { formatPrice } from "@/lib/format";
import { syncOrderPaymentFromGateway } from "@/lib/payments/sync-order-payment";
import { Button } from "@/components/ui/button";
import { PendingPaymentPoller } from "./pending-payment-poller";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string; payment_id?: string }>;
}

export default async function PedidoPendentePage({
  params,
  searchParams,
}: PageProps) {
  const { orderId } = await params;
  const { token, payment_id: paymentIdRaw } = await searchParams;
  if (!token) notFound();

  const paymentId =
    paymentIdRaw && paymentIdRaw !== "null" ? paymentIdRaw : null;

  if (paymentId) {
    let syncPaid = false;
    let syncStatus = "";
    try {
      const sync = await syncOrderPaymentFromGateway({
        orderId,
        accessToken: token,
        paymentId,
      });
      syncPaid = sync.paid;
      syncStatus = sync.status;
    } catch (error) {
      console.error("pendente sync payment:", error);
    }

    if (syncPaid) {
      redirect(
        `/pedido/${orderId}/sucesso?token=${encodeURIComponent(token)}&payment_id=${encodeURIComponent(paymentId)}`
      );
    }
    if (
      syncStatus &&
      syncStatus !== "pending" &&
      syncStatus !== "in_process" &&
      syncStatus !== "approved"
    ) {
      redirect(
        `/pedido/${orderId}/falha?token=${encodeURIComponent(token)}&motivo=${encodeURIComponent(`Pagamento ${syncStatus}`)}`
      );
    }
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      paymentAccessToken: token,
      source: "ONLINE",
    },
    select: {
      id: true,
      status: true,
      customerName: true,
      totalAmount: true,
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
    redirect(
      `/pedido/${order.id}/falha?token=${encodeURIComponent(order.paymentAccessToken)}&motivo=${encodeURIComponent("Pedido cancelado")}`
    );
  }

  const firstName = order.customerName.split(" ")[0] || "cliente";
  const shortId = order.id.slice(-8).toUpperCase();
  const payUrl = `/pedido/${order.id}/pagar?token=${encodeURIComponent(order.paymentAccessToken)}`;
  const refreshQs = new URLSearchParams({ token });
  if (paymentId) refreshQs.set("payment_id", paymentId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Clock3 className="h-9 w-9" />
          </span>
          <p className="mt-4 text-sm font-medium text-amber-700">
            Pagamento em análise
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-stone-800">
            Quase lá, {firstName}
          </h1>
          <p className="mt-3 max-w-sm text-stone-500">
            O Mercado Pago ainda está confirmando seu pagamento (comum em PIX).
            Assim que confirmar, o pedido vai para a cozinha automaticamente.
          </p>
        </div>

        <div className="mt-6 space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Pedido</span>
            <span className="font-semibold text-stone-800">#{shortId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Valor</span>
            <span className="font-semibold text-coffee-700">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
        </div>

        <PendingPaymentPoller
          orderId={order.id}
          accessToken={order.paymentAccessToken}
        />

        <div className="mt-8 space-y-3">
          <Button asChild className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700">
            <Link href={`/pedido/${order.id}/pendente?${refreshQs.toString()}`}>
              <RefreshCw className="h-4 w-4" />
              Atualizar status
            </Link>
          </Button>
          {order.status === OrderStatus.AWAITING_PAYMENT && (
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={payUrl}>Tentar pagar de novo</Link>
            </Button>
          )}
          <Button asChild variant="ghost" className="h-11 w-full">
            <Link href="/">Voltar ao cardápio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
