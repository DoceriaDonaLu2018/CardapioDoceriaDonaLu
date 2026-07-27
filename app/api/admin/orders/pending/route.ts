import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { KITCHEN_VISIBLE_STATUSES } from "@/lib/orders/constants";

export const dynamic = "force-dynamic";

/**
 * Short-polling de pedidos prontos para a cozinha.
 * REGRA DE OURO: ignora AWAITING_PAYMENT — só PENDING (PDV) e PAID (online confirmado).
 *
 * - `?countOnly=1` → só a contagem (badge da sidebar; query leve).
 * - sem param → lista completa (painel de recepção / auto-impressão).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const countOnly =
    request.nextUrl.searchParams.get("countOnly") === "1" ||
    request.nextUrl.searchParams.get("countOnly") === "true";

  const kitchenWhere = {
    status: { in: [...KITCHEN_VISIBLE_STATUSES] },
  };

  try {
    if (countOnly) {
      const count = await prisma.order.count({
        where: kitchenWhere,
      });
      return NextResponse.json({ count, orders: [] });
    }

    const orders = await prisma.order.findMany({
      where: kitchenWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        waiterName: true,
        createdAt: true,
        totalAmount: true,
        advancePayment: true,
        status: true,
        source: true,
        deliveryAddress: true,
        items: {
          select: {
            quantity: true,
            priceAtTime: true,
            productTitle: true,
            product: { select: { title: true } },
          },
        },
      },
    });

    const serialized = orders.map((order) => ({
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      waiterName: order.waiterName,
      createdAt: order.createdAt.toISOString(),
      totalAmount: order.totalAmount,
      advancePayment: order.advancePayment,
      status: order.status,
      source: order.source,
      deliveryAddress: order.deliveryAddress,
      items: order.items.map((item) => ({
        quantity: item.quantity,
        priceAtTime: item.priceAtTime,
        productTitle: item.productTitle,
        product: {
          title:
            (item.productTitle && item.productTitle.trim()) ||
            item.product.title,
        },
      })),
    }));

    return NextResponse.json({ count: serialized.length, orders: serialized });
  } catch (error) {
    console.error("pending orders:", error);
    return NextResponse.json(
      { error: "Erro ao consultar pedidos.", count: 0, orders: [] },
      { status: 500 }
    );
  }
}
