import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { createPixForOrder, getPixStatusForOrder } from "@/lib/payments/pix";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";
import { isValidCpf, normalizeCpf } from "@/lib/validation/cpf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const orderAuthSchema = z.object({
  orderId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  accessToken: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[a-f0-9]+$/i),
});

const createBodySchema = orderAuthSchema.extend({
  cpf: z.string().min(11).max(18),
});

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: `Muitas tentativas. Aguarde ${retryAfterSec}s.` },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}

/**
 * GET /api/payment/pix
 * Polling do PIX. Fonte da verdade do "pago" = status do pedido no banco
 * (atualizado pelo webhook + GET /v1/payments). Não consulta o gateway.
 *
 * Query: orderId, token, includeQr=1 (somente no carregamento inicial).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  const accessToken = request.nextUrl.searchParams.get("token") ?? "";
  const includeQr = request.nextUrl.searchParams.get("includeQr") === "1";

  const parsed = orderAuthSchema.safeParse({ orderId, accessToken });
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const ip = clientIp(request);
  const pollLimit = assertMemoryRateLimit(
    `pix-status:${parsed.data.accessToken}:${ip}`,
    includeQr ? 20 : 40,
    60 * 1000
  );
  if (!pollLimit.ok) {
    return rateLimitResponse(pollLimit.retryAfterSec);
  }

  const result = await getPixStatusForOrder({
    orderId: parsed.data.orderId,
    accessToken: parsed.data.accessToken,
    includeQr,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    paid: result.paid,
    orderStatus: result.orderStatus,
    pix: result.pix,
  });
}

/**
 * POST /api/payment/pix
 * Cria (ou reutiliza) um pagamento PIX no servidor. Valor sempre do pedido.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe o pedido e um CPF válido." },
      { status: 400 }
    );
  }

  if (!isValidCpf(normalizeCpf(parsed.data.cpf))) {
    return NextResponse.json(
      { error: "Informe um CPF válido." },
      { status: 400 }
    );
  }

  const ip = clientIp(request);
  const createLimit = assertMemoryRateLimit(
    `pix-create:${parsed.data.orderId}:${ip}`,
    8,
    15 * 60 * 1000
  );
  if (!createLimit.ok) {
    return rateLimitResponse(createLimit.retryAfterSec);
  }

  const result = await createPixForOrder({
    orderId: parsed.data.orderId,
    accessToken: parsed.data.accessToken,
    cpf: parsed.data.cpf,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.httpStatus }
    );
  }

  if (result.paid) {
    return NextResponse.json(
      {
        paid: true,
        orderStatus: result.orderStatus,
        error: "Este pedido já foi pago.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    paid: false,
    paymentId: result.pix.paymentId,
    status: result.pix.status,
    qrCode: result.pix.qrCode,
    qrCodeBase64: result.pix.qrCodeBase64 ?? null,
    expiresAt: result.pix.expiresAt,
  });
}
