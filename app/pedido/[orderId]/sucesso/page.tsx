import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { formatPrice } from "@/lib/format";
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
      totalAmount: true,
      deliveryAddress: true,
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="mt-4 font-serif text-3xl font-bold text-stone-800">
            Pedido confirmado!
          </h1>
          <p className="mt-2 text-stone-500">
            Olá, {order.customerName.split(" ")[0]} — recebemos seu PIX e o
            pedido já foi para a cozinha.
          </p>
        </div>

        <div className="mt-8 space-y-3 rounded-xl bg-stone-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Pedido</span>
            <span className="font-semibold text-stone-800">
              #{order.id.slice(-8).toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Total pago</span>
            <span className="font-semibold text-coffee-700">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
          {order.deliveryAddress && (
            <div>
              <p className="text-stone-500">Entrega</p>
              <p className="font-medium text-stone-800">{order.deliveryAddress}</p>
            </div>
          )}
          <ul className="space-y-1 border-t border-stone-200 pt-3">
            {order.items.map((item, index) => (
              <li key={`${item.productTitle}-${index}`} className="text-stone-700">
                {item.quantity}× {item.productTitle}
              </li>
            ))}
          </ul>
        </div>

        <Button
          asChild
          className="mt-8 h-12 w-full bg-coffee-600 text-white hover:bg-coffee-700"
        >
          <Link href="/">Voltar ao cardápio</Link>
        </Button>
      </div>
    </div>
  );
}
