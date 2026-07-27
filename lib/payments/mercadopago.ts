import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Cliente Mercado Pago — SOMENTE server-side.
 * Access Token e Webhook Secret NUNCA devem ir para o browser.
 * Checkout Pro: POST /checkout/preferences → redirect init_point.
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
      "No Vercel, use um Access Token válido (TEST-… para teste ou APP_USR-… para produção) " +
      "e confirme que a conta/aplicação está ativa."
    );
  }
  if (msg.includes("unauthorized") || msg.includes("invalid access token")) {
    return "Access Token do Mercado Pago inválido ou ausente. Verifique MERCADOPAGO_ACCESS_TOKEN no Vercel.";
  }
  return raw;
}

function notificationUrl(): string {
  return `${getAppBaseUrl()}/api/webhooks/mercadopago?source_news=webhooks`;
}

export type CheckoutProItem = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
};

export type CheckoutProPaymentChoice = "pix" | "card";

export type CreateCheckoutProPreferenceInput = {
  orderId: string;
  accessToken: string;
  items: CheckoutProItem[];
  payerEmail: string;
  payerName: string;
  paymentChoice: CheckoutProPaymentChoice;
};

function paymentMethodsForChoice(choice: CheckoutProPaymentChoice) {
  if (choice === "pix") {
    // Só PIX (bank_transfer) — sem cartão / boleto.
    return {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" },
        { id: "atm" },
        { id: "prepaid_card" },
      ],
      installments: 1,
    };
  }

  // Só cartão (crédito/débito) — sem PIX / boleto.
  return {
    excluded_payment_types: [
      { id: "ticket" },
      { id: "bank_transfer" },
      { id: "atm" },
    ],
    installments: 12,
  };
}

/**
 * Checkout Pro: cria preferência e devolve a URL do Mercado Pago.
 * O cliente escolhe PIX ou cartão no site; no MP só aparece o meio escolhido.
 */
export async function createCheckoutProPreference(
  input: CreateCheckoutProPreferenceInput
): Promise<{ checkoutUrl: string }> {
  const token = getAccessToken();
  const base = getAppBaseUrl();

  if (base.includes("localhost") || base.includes("127.0.0.1")) {
    throw new Error(
      "Checkout Pro exige NEXT_PUBLIC_APP_URL pública (HTTPS). " +
        "Localhost não funciona no retorno do Mercado Pago — use o domínio da Vercel."
    );
  }

  const tokenQs = encodeURIComponent(input.accessToken);

  // back_urls — espelha a doc do Checkout Pro (success / failure / pending).
  // O MP anexa na volta: payment_id, status, external_reference, etc. (GET).
  // Não use localhost — só domínio HTTPS público (NEXT_PUBLIC_APP_URL).
  const back_urls = {
    success: `${base}/pedido/${input.orderId}/sucesso?token=${tokenQs}`,
    failure: `${base}/pedido/${input.orderId}/falha?token=${tokenQs}`,
    pending: `${base}/pedido/${input.orderId}/pendente?token=${tokenQs}`,
  };

  const body = {
    items: input.items.map((item) => ({
      id: item.id,
      title: item.title.slice(0, 256),
      quantity: item.quantity,
      unit_price: Math.round(item.unitPrice * 100) / 100,
      currency_id: "BRL",
    })),
    payer: {
      email: input.payerEmail,
      name: input.payerName.slice(0, 100) || "Cliente",
    },
    // Sincroniza com o orderId no retorno (external_reference na query).
    external_reference: input.orderId,
    notification_url: notificationUrl(),
    back_urls,
    // Redireciona sozinho quando aprovado (até ~40s) + botão "Voltar ao site".
    auto_return: "approved" as const,
    statement_descriptor: "DONA LU",
    shipments: {
      local_pickup: true,
    },
    payment_methods: paymentMethodsForChoice(input.paymentChoice),
  };

  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Chave distinta por meio — trocar PIX↔cartão gera preferência correta.
      "X-Idempotency-Key": `ddl-pref-${input.orderId}-${input.paymentChoice}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
    error?: string;
    cause?: Array<{ description?: string }>;
  };

  if (!response.ok || !data.id) {
    console.error("Mercado Pago create preference failed:", data);
    const msg =
      data.cause?.[0]?.description ||
      data.message ||
      data.error ||
      "Falha ao criar preferência de pagamento.";
    throw new Error(mapMercadoPagoError(msg));
  }

  const isTestToken = token.startsWith("TEST-");
  const checkoutUrl = isTestToken
    ? data.sandbox_init_point || data.init_point
    : data.init_point || data.sandbox_init_point;

  if (!checkoutUrl) {
    throw new Error("Mercado Pago não retornou a URL de checkout.");
  }

  return { checkoutUrl };
}

/** Reconsulta o pagamento no gateway (fonte da verdade — não confiar só no webhook). */
export async function fetchMercadoPagoPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  externalReference: string | null;
  paymentMethodId: string | null;
}> {
  const accessToken = getAccessToken();
  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const data = (await response.json()) as {
    id?: number | string;
    status?: string;
    transaction_amount?: number;
    external_reference?: string | null;
    payment_method_id?: string;
  };

  if (!response.ok || data.id == null) {
    throw new Error("Não foi possível validar o pagamento no gateway.");
  }

  return {
    id: String(data.id),
    status: data.status ?? "",
    amount: Number(data.transaction_amount ?? 0),
    externalReference: data.external_reference ?? null,
    paymentMethodId: data.payment_method_id ?? null,
  };
}

/** Validação criptográfica do webhook Mercado Pago (x-signature). */
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
