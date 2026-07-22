import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Endpoint de short-polling: retorna os pedidos pendentes (mais antigos primeiro)
// e a contagem, usado pela badge da sidebar e pelo painel de recepção.
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        items: {
          include: { product: { select: { title: true } } },
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
