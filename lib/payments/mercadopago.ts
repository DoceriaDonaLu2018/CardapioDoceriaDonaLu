import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Cliente Mercado Pago — SOMENTE server-side (exceto Public Key no frontend).
 * Access Token e Webhook Secret NUNCA devem ir para o browser.
 */

const MP_API = "https://api.mercadopago.com";

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "MERCADOPAGO_ACCESS_TOKEN não configurado. Defina no Vercel (somente backend)."
    );
  }
  return token;
}

function getWebhookSecret(): string {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "MERCADOPAGO_WEBHOOK_SECRET não configurado. Use a chave de Webhooks do painel MP."
    );
  }
  return secret;
}

export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (fromEnv) {
    return fromEnv.startsWith("http")
      ? fromEnv.replace(/\/$/, "")
      : `https://${fromEnv.replace(/\/$/, "")}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

export function createPaymentAccessToken(): string {
  return randomBytes(24).toString("hex");
}

/** Mensagens amigáveis para erros comuns do Mercado Pago. */
export function mapMercadoPagoError(raw: string): string {
  const msg = raw.toLowerCase();
  if (
    msg.includes("unauthorized use of live credentials") ||
    msg.includes("live credentials")
  ) {
    return (
      "Credenciais de produção do Mercado Pago não autorizadas neste ambiente. " +
      "No Vercel, use Access Token + Public Key do MESMO modo (teste com TEST-… " +
      "ou produção com APP_USR-…) e confirme que a conta/aplicação está ativa."
    );
  }
  if (msg.includes("unauthorized") || msg.includes("invalid access token")) {
    return "Access Token do Mercado Pago inválido ou ausente. Verifique MERCADOPAGO_ACCESS_TOKEN no Vercel.";
  }
  if (msg.includes("public_key") || msg.includes("public key")) {
    return "Public Key do Mercado Pago inválida. Verifique NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY no Vercel.";
  }
  return raw;
}

export type CreatePixPaymentInput = {
  orderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
};

export type CreatePixPaymentResult = {
  paymentId: string;
  status: string;
  copyPaste: string;
  qrCodeBase64: string | null;
};

export type CreateCardPaymentInput = {
  orderId: string;
  amount: number;
  description: string;
  token: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string | number | null;
  payerEmail: string;
  identificationType: string;
  identificationNumber: string;
};

export type CreateCardPaymentResult = {
  paymentId: string;
  status: string;
  statusDetail: string | null;
};

type MpPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  message?: string;
  error?: string;
  cause?: Array<{ description?: string; code?: string | number }>;
};

function extractMpErrorMessage(data: MpPaymentResponse): string {
  const cause = data.cause?.[0]?.description;
  return (
    cause ||
    data.message ||
    data.error ||
    "Falha ao processar o pagamento no Mercado Pago."
  );
}

function notificationUrl(): string {
  return `${getAppBaseUrl()}/api/webhooks/mercadopago?source_news=webhooks`;
}

/** Gera PIX dinâmico atrelado ao orderId (external_reference). */
export async function createMercadoPagoPixPayment(
  input: CreatePixPaymentInput
): Promise<CreatePixPaymentResult> {
  const token = getAccessToken();
  const amount = Math.round(input.amount * 100) / 100;

  if (!Number.isFinite(amount) || amount < 0.01) {
    throw new Error("Valor do pagamento PIX inválido.");
  }

  const body = {
    transaction_amount: amount,
    description: input.description.slice(0, 255),
    payment_method_id: "pix",
    external_reference: input.orderId,
    notification_url: notificationUrl(),
    payer: {
      email: input.payerEmail,
      first_name: input.payerName.slice(0, 80) || "Cliente",
    },
  };

  const response = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `ddl-pix-${input.orderId}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as MpPaymentResponse;

  if (!response.ok || data.id == null) {
    console.error("Mercado Pago create PIX failed:", data);
    throw new Error(mapMercadoPagoError(extractMpErrorMessage(data)));
  }

  const copyPaste = data.point_of_interaction?.transaction_data?.qr_code;
  if (!copyPaste) {
    throw new Error("Gateway não retornou o código PIX Copia e Cola.");
  }

  return {
    paymentId: String(data.id),
    status: data.status ?? "pending",
    copyPaste,
    qrCodeBase64:
      data.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
  };
}

/**
 * Cria pagamento com cartão usando token gerado no frontend (Card Payment Brick).
 * O servidor NUNCA recebe número/CVV — só o token opaco do Mercado Pago.
 */
export async function createMercadoPagoCardPayment(
  input: CreateCardPaymentInput
): Promise<CreateCardPaymentResult> {
  const accessToken = getAccessToken();
  const amount = Math.round(input.amount * 100) / 100;

  if (!Number.isFinite(amount) || amount < 0.01) {
    throw new Error("Valor do pagamento com cartão inválido.");
  }
  if (!input.token.trim()) {
    throw new Error("Token do cartão ausente.");
  }

  const body: Record<string, unknown> = {
    transaction_amount: amount,
    token: input.token,
    description: input.description.slice(0, 255),
    installments: Math.max(1, Math.floor(input.installments || 1)),
    payment_method_id: input.paymentMethodId,
    external_reference: input.orderId,
    notification_url: notificationUrl(),
    payer: {
      email: input.payerEmail,
      identification: {
        type: input.identificationType,
        number: input.identificationNumber.replace(/\D/g, ""),
      },
    },
  };

  if (input.issuerId != null && String(input.issuerId).length > 0) {
    body.issuer_id = String(input.issuerId);
  }

  const response = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      // Nova tentativa = nova chave (token do cartão é de uso único).
      "X-Idempotency-Key": `ddl-card-${input.orderId}-${input.token.slice(0, 16)}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as MpPaymentResponse;

  if (!response.ok || data.id == null) {
    console.error("Mercado Pago create card payment failed:", data);
    throw new Error(mapMercadoPagoError(extractMpErrorMessage(data)));
  }

  return {
    paymentId: String(data.id),
    status: data.status ?? "pending",
    statusDetail: data.status_detail ?? null,
  };
}

/** Reconsulta o pagamento no gateway (fonte da verdade — não confiar só no webhook). */
export async function fetchMercadoPagoPayment(
  paymentId: string
): Promise<{
  id: string;
  status: string;
  amount: number;
  externalReference: string | null;
}> {
  const token = getAccessToken();
  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = (await response.json()) as MpPaymentResponse;
  if (!response.ok || data.id == null) {
    throw new Error("Não foi possível validar o pagamento no gateway.");
  }

  return {
    id: String(data.id),
    status: data.status ?? "",
    amount: Number(data.transaction_amount ?? 0),
    externalReference: data.external_reference ?? null,
  };
}

/**
 * PROTEÇÃO 1 — Validação criptográfica do webhook Mercado Pago.
 */
export function verifyMercadoPagoWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = getWebhookSecret();
  const { xSignature, xRequestId, dataId } = params;

  if (!xSignature) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((chunk) => {
      const [key, ...rest] = chunk.trim().split("=");
      return [key, rest.join("=")];
    })
  ) as { ts?: string; v1?: string };

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const tsMs = Number(ts);
  if (Number.isFinite(tsMs)) {
    const skew = Math.abs(Date.now() - tsMs);
    if (skew > 5 * 60 * 1000) return false;
  }

  let manifest = "";
  if (dataId) {
    manifest += `id:${dataId.toLowerCase()};`;
  }
  if (xRequestId) {
    manifest += `request-id:${xRequestId};`;
  }
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(v1, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
