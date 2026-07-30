import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  applyMercadoPagoPaymentId,
  fetchMerchantOrderPaymentIds,
} from "@/lib/payments/apply-approved-payment";
import { verifyMercadoPagoWebhookSignature } from "@/lib/payments/mercadopago";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook Mercado Pago — Checkout Pro.
 *
 * BUG CRÍTICO CORRIGIDO:
 * Antes gravávamos PaymentWebhookEvent no status `pending`. Quando o MP
 * reenviava o mesmo payment_id já `approved`, o handler abortava como
 * "duplicate" e o pedido ficava eterno em AWAITING_PAYMENT (fora do painel).
 *
 * Agora:
 * - Sempre reconsulta GET /v1/payments/{id} (fonte da verdade)
 * - Só marca evento como "aplicado" após approved processado (ou terminal)
 * - Se o evento existir mas o pedido ainda aguarda, REPROCESSA
 * - Aceita topic payment + merchant_order (Checkout Pro)
 * - Body vazio / não-JSON não derruba a notificação (id na query)
 */

const webhookBodySchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    topic: z.string().optional(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]),
      })
      .optional(),
    live_mode: z.boolean().optional(),
  })
  .passthrough();

function eventKeyForPayment(paymentId: string): string {
  return `mp:payment:${paymentId}`;
}

async function markPaymentEvent(
  paymentId: string,
  orderId: string | null,
  applied: boolean
): Promise<void> {
  const id = eventKeyForPayment(paymentId);
  try {
    await prisma.paymentWebhookEvent.upsert({
      where: { id },
      create: {
        id,
        paymentId,
        orderId,
      },
      update: {
        paymentId,
        orderId: orderId ?? undefined,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
  // `applied` reservado para logs futuros / schema; upsert já idempotente.
  void applied;
}

async function processPaymentId(paymentId: string): Promise<{
  ok: boolean;
  result: string;
  orderId?: string;
  retryable?: boolean;
}> {
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { id: eventKeyForPayment(paymentId) },
    select: { id: true, orderId: true },
  });

  // Se já processamos e o pedido está PAID/COMPLETED, não refaz trabalho.
  if (existing?.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: existing.orderId },
      select: { status: true },
    });
    if (
      order?.status === "PAID" ||
      order?.status === "COMPLETED" ||
      order?.status === "REQUIRES_REFUND"
    ) {
      return { ok: true, result: "duplicate_paid", orderId: existing.orderId };
    }
    // Evento existe mas pedido ainda NÃO está pago → continua (fix do bug).
  }

  let outcome;
  try {
    outcome = await applyMercadoPagoPaymentId(paymentId);
  } catch (error) {
    console.error("webhook apply payment:", paymentId, error);
    return { ok: false, result: "gateway_error", retryable: true };
  }

  switch (outcome.outcome) {
    case "paid":
    case "already_paid": {
      await markPaymentEvent(outcome.paymentId, outcome.orderId, true);
      return {
        ok: true,
        result: outcome.outcome,
        orderId: outcome.orderId,
      };
    }
    case "pending": {
      // NÃO trava o payment_id — o MP reenviará quando approved.
      console.info("webhook payment still pending", {
        paymentId: outcome.paymentId,
        status: outcome.status,
        orderId: outcome.orderId,
      });
      return {
        ok: true,
        result: "pending",
        orderId: outcome.orderId ?? undefined,
      };
    }
    case "rejected": {
      await markPaymentEvent(outcome.paymentId, outcome.orderId, true);
      return {
        ok: true,
        result: "rejected",
        orderId: outcome.orderId ?? undefined,
      };
    }
    case "amount_mismatch": {
      // Não ACK permanente: devolve 5xx para o MP retentar após correção.
      console.error("webhook amount mismatch — pedido NÃO promovido", outcome);
      return {
        ok: false,
        result: "amount_mismatch",
        orderId: outcome.orderId,
        retryable: true,
      };
    }
    case "unmatched": {
      console.warn("webhook unmatched payment", outcome);
      await markPaymentEvent(outcome.paymentId, null, true);
      return { ok: true, result: "unmatched" };
    }
    case "requires_refund": {
      // Pagamento aprovado no MP, estoque insuficiente — NÃO retentar (evita loop).
      // Admin deve estornar / contatar cliente. Pedido fora da cozinha.
      console.error(
        "webhook REQUIRES_REFUND — cobrado sem estoque",
        outcome
      );
      await markPaymentEvent(outcome.paymentId, outcome.orderId, true);
      return {
        ok: true,
        result: "requires_refund",
        orderId: outcome.orderId,
      };
    }
    default:
      return { ok: true, result: "ignored" };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  // IDs: query (padrão MP) ou body. Legacy IPN: ?id=&topic=
  const queryDataId =
    request.nextUrl.searchParams.get("data.id") ||
    request.nextUrl.searchParams.get("id");

  let rawBody: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      rawBody = JSON.parse(text) as unknown;
    }
  } catch {
    // Body vazio / form — segue com query params.
    rawBody = {};
  }

  const parsedBody = webhookBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const bodyDataId =
    parsedBody.data.data?.id != null
      ? String(parsedBody.data.data.id)
      : parsedBody.data.id != null
        ? String(parsedBody.data.id)
        : null;

  const dataId = (queryDataId || bodyDataId || "").trim() || null;

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
      hasSignature: Boolean(xSignature),
    });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const topicRaw =
    request.nextUrl.searchParams.get("type") ||
    request.nextUrl.searchParams.get("topic") ||
    parsedBody.data.type ||
    parsedBody.data.topic ||
    "";
  const topic = topicRaw.toLowerCase();

  // Merchant order (Checkout Pro): resolve payment IDs internos.
  const isMerchantOrder =
    topic.includes("merchant_order") || topic === "topic_merchant_order_wh";

  if (isMerchantOrder) {
    if (!dataId) {
      return NextResponse.json({ error: "merchant_order id ausente." }, { status: 400 });
    }

    let paymentIds: string[];
    try {
      paymentIds = await fetchMerchantOrderPaymentIds(dataId);
    } catch (error) {
      console.error("webhook merchant_order fetch:", error);
      return NextResponse.json(
        { error: "Falha ao validar merchant_order." },
        { status: 502 }
      );
    }

    const results = [];
    for (const paymentId of paymentIds) {
      const r = await processPaymentId(paymentId);
      results.push({ paymentId, ...r });
      if (r.retryable) {
        return NextResponse.json(
          { error: "Falha temporária ao aplicar pagamento.", results },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ ok: true, topic: "merchant_order", results });
  }

  // Tópicos que não processamos: ACK 200 (evita retentativas infinitas).
  if (
    topic &&
    topic !== "payment" &&
    !topic.includes("payment")
  ) {
    return NextResponse.json({ ok: true, ignored: true, topic });
  }

  if (!dataId) {
    return NextResponse.json({ error: "data.id ausente." }, { status: 400 });
  }

  const processed = await processPaymentId(dataId);
  if (processed.retryable) {
    return NextResponse.json(
      { error: "Falha temporária ao aplicar pagamento.", ...processed },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: processed.ok,
    result: processed.result,
    orderId: processed.orderId,
  });
}

/** MP às vezes envia GET de verificação — responde 200. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
