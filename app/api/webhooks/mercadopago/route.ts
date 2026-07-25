import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import {
  fetchMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/payments/mercadopago";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook Mercado Pago — área de maior risco (AppSec).
 *
 * Camadas:
 * 1) Assinatura HMAC (x-signature) — rejeita origem falsa (401)
 * 2) Zod no payload — rejeita body malformado (400)
 * 3) Idempotência — PaymentWebhookEvent + update condicional
 * 4) Revalidação no gateway — amount/status/external_reference oficiais
 */

const webhookBodySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  type: z.string().optional(),
  action: z.string().optional(),
  data: z
    .object({
      id: z.union([z.string(), z.number()]),
    })
    .optional(),
  live_mode: z.boolean().optional(),
});

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02; // tolerância de 2 centavos (float)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  // data.id pode vir na query (padrão MP) ou no body.
  const queryDataId = request.nextUrl.searchParams.get("data.id");

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsedBody = webhookBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const bodyDataId =
    parsedBody.data.data?.id != null
      ? String(parsedBody.data.data.id)
      : null;
  const dataId = (queryDataId || bodyDataId || "").trim() || null;

  // PROTEÇÃO 1 — assinatura criptográfica obrigatória.
  let signatureOk = false;
  try {
    signatureOk = verifyMercadoPagoWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
    });
  } catch (error) {
    console.error("webhook signature config:", error);
    return NextResponse.json(
      { error: "Webhook não configurado no servidor." },
      { status: 503 }
    );
  }

  if (!signatureOk) {
    console.warn("Webhook MP rejeitado: assinatura inválida.", {
      xRequestId,
      dataId,
    });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  // Notificações que não são de payment: ACK sem processar.
  const topic =
    request.nextUrl.searchParams.get("type") ||
    request.nextUrl.searchParams.get("topic") ||
    parsedBody.data.type ||
    "";

  if (topic && topic !== "payment") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!dataId) {
    return NextResponse.json({ error: "data.id ausente." }, { status: 400 });
  }

  const eventKey = `mp:payment:${dataId}`;

  // PROTEÇÃO 2 — idempotência: se já processamos este evento, 200 silencioso.
  const already = await prisma.paymentWebhookEvent.findUnique({
    where: { id: eventKey },
    select: { id: true },
  });
  if (already) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Fonte da verdade: busca o pagamento no MP (não confiar no body).
  let payment;
  try {
    payment = await fetchMercadoPagoPayment(dataId);
  } catch (error) {
    console.error("webhook fetch payment:", error);
    return NextResponse.json(
      { error: "Falha ao validar pagamento no gateway." },
      { status: 502 }
    );
  }

  // Só promove o pedido quando o gateway confirma approved.
  if (payment.status !== "approved") {
    // Registra o evento mesmo assim para não reprocessar spam do mesmo id.
    await prisma.paymentWebhookEvent.create({
      data: {
        id: eventKey,
        paymentId: payment.id,
        orderId: payment.externalReference,
      },
    });
    return NextResponse.json({
      ok: true,
      status: payment.status,
      pending: true,
    });
  }

  const orderId = payment.externalReference?.trim();
  if (!orderId) {
    await prisma.paymentWebhookEvent.create({
      data: { id: eventKey, paymentId: payment.id },
    });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      paymentId: true,
    },
  });

  if (!order) {
    await prisma.paymentWebhookEvent.create({
      data: { id: eventKey, paymentId: payment.id, orderId },
    });
    return NextResponse.json({ ok: true, orderMissing: true });
  }

  // Anti-fraude: valor pago deve bater com o total persistido no banco.
  if (!amountsMatch(payment.amount, order.totalAmount)) {
    console.error("Webhook amount mismatch", {
      orderId,
      expected: order.totalAmount,
      got: payment.amount,
    });
    return NextResponse.json(
      { error: "Valor do pagamento não confere." },
      { status: 409 }
    );
  }

  // paymentId do pedido deve bater (se já vinculado na criação do PIX).
  if (order.paymentId && order.paymentId !== payment.id) {
    console.error("Webhook paymentId mismatch", {
      orderId,
      expected: order.paymentId,
      got: payment.id,
    });
    return NextResponse.json(
      { error: "Pagamento não corresponde ao pedido." },
      { status: 409 }
    );
  }

  // Transação atômica: marca evento + promove AWAITING_PAYMENT → PAID.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({
        data: {
          id: eventKey,
          paymentId: payment.id,
          orderId: order.id,
        },
      });

      // Idempotência no pedido: se já estiver PAID/COMPLETED, não altera.
      if (
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.COMPLETED
      ) {
        return;
      }

      if (order.status !== OrderStatus.AWAITING_PAYMENT) {
        // Não promove pedidos cancelados / PDV etc.
        return;
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentId: payment.id,
          paidAt: new Date(),
        },
      });
    });
  } catch (error) {
    // Corrida entre webhooks duplicados: unique em PaymentWebhookEvent.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  // A partir daqui o pedido PAID entra no painel da cozinha (filtro PENDING|PAID).
  return NextResponse.json({ ok: true, paid: true, orderId: order.id });
}

/** MP às vezes envia GET de verificação — responde 200. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
