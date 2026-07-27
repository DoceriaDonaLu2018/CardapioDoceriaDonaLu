import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, MapPin, MessageCircle } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { OrderStatus, PICKUP_FULFILLMENT_LABEL } from "@/lib/orders/constants";
import { formatPhone, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function PedidoSucessoPage({
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
      status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
    },
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      totalAmount: true,
      deliveryAddress: true,
      paymentMethod: true,
      paidAt: true,
      items: {
        select: {
          quantity: true,
          productTitle: true,
          priceAtTime: true,
        },
      },
    },
  });

  if (!order) notFound();

  const firstName = order.customerName.split(" ")[0] || "cliente";
  const shortId = order.id.slice(-8).toUpperCase();
  const isPickup =
    !order.deliveryAddress ||
    order.deliveryAddress === PICKUP_FULFILLMENT_LABEL;
  const methodLabel =
    !order.paymentMethod || order.paymentMethod === "pix"
      ? "PIX"
      : "Cartão";

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <p className="mt-4 text-sm font-medium text-green-700">
            Pagamento registrado com sucesso
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-stone-800">
            Pedido confirmado!
          </h1>
          <p className="mt-3 max-w-sm text-stone-500">
            Olá, {firstName}! Recebemos seu pagamento via {methodLabel}. Seu
            pedido já está sendo preparado na Doceria Dona Lu.
          </p>
        </div>

        <div className="mt-6 space-y-3 rounded-xl border border-green-100 bg-green-50/60 px-4 py-3 text-sm text-green-900">
          <div className="flex items-start gap-2">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Em breve sua encomenda estará pronta
              {isPickup ? " para retirada no local" : " para entrega"}.
            </p>
          </div>
          {isPickup && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Modalidade: <strong>Retirada no local</strong>. Guarde o número
                do pedido para apresentar na loja.
              </p>
            </div>
          )}
          {order.customerPhone && (
            <div className="flex items-start gap-2">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Podemos falar com você no WhatsApp{" "}
                <strong>{formatPhone(order.customerPhone)}</strong> se
                precisarmos.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3 rounded-xl bg-stone-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Pedido</span>
            <span className="font-semibold text-stone-800">#{shortId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Pagamento</span>
            <span className="font-medium text-stone-800">{methodLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Total pago</span>
            <span className="font-semibold text-coffee-700">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
          <ul className="space-y-1 border-t border-stone-200 pt-3">
            {order.items.map((item, index) => (
              <li
                key={`${item.productTitle}-${index}`}
                className="flex justify-between gap-3 text-stone-700"
              >
                <span>
                  {item.quantity}× {item.productTitle}
                </span>
                <span className="shrink-0 text-stone-500">
                  {formatPrice(item.priceAtTime * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 space-y-3">
          <Button
            asChild
            className="h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700"
          >
            <Link href="/">Voltar ao cardápio</Link>
          </Button>
          <p className="text-center text-xs text-stone-400">
            Guarde este número: <strong>#{shortId}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
