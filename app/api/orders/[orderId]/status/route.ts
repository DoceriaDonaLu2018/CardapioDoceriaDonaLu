import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Polling leve do status do pedido (tela pendente / retorno do Checkout Pro).
 * Exige paymentAccessToken (não é a secret do gateway) para evitar enumeração.
 */
const paramsSchema = z.object({
  orderId: z.string().min(8).max(64),
  token: z.string().min(32).max(128),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
  const { orderId } = await context.params;
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const parsed = paramsSchema.safeParse({ orderId, token });
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const pollLimit = assertMemoryRateLimit(
    `order-status:${parsed.data.token}:${ip}`,
    40,
    60 * 1000
  );
  if (!pollLimit.ok) {
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde um instante." },
      {
        status: 429,
        headers: { "Retry-After": String(pollLimit.retryAfterSec) },
      }
    );
  }

  const order = await prisma.order.findFirst({
    where: {
      id: parsed.data.orderId,
      paymentAccessToken: parsed.data.token,
      source: "ONLINE",
    },
    select: {
      status: true,
      totalAmount: true,
      paidAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    status: order.status,
    paid:
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.COMPLETED,
    totalAmount: order.totalAmount,
    paidAt: order.paidAt?.toISOString() ?? null,
  });
}
