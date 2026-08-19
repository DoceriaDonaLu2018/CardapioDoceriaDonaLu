import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import { BRASILIA_TZ } from "@/lib/timezone";

/**
 * Cliente Mercado Pago — SOMENTE server-side.
 * Access Token e Webhook Secret NUNCA devem ir para o browser.
 * Checkout Pro: POST /checkout/preferences → redirect init_point.
 * PIX transparente: POST /v1/payments (payment_method_id=pix) → QR no site.
 */

/** Mensagem segura para o cliente quando o PIX não pode ser gerado. */
export const PIX_USER_ERROR =
  "Não foi possível gerar o PIX. Tente novamente em alguns instantes.";

/** Limite documentado do header X-Idempotency-Key (Payments / Orders). */
export const MERCADOPAGO_IDEMPOTENCY_KEY_MAX = 64;

const MP_API = "https://api.mercadopago.com";

/** Timeout padrão das chamadas ao gateway (evita handler pendurado). */
const MP_FETCH_TIMEOUT_MS = 8000;
const MP_CREATE_PIX_TIMEOUT_MS = 12000;

/**
 * IDs de payment / merchant_order do MP são numéricos.
 * Sem isso, `payment_id=1/../users/me` no retorno do checkout faria o
 * Access Token da loja bater em outro path da API (SSRF interno).
 */
const MP_RESOURCE_ID_RE = /^\d{1,24}$/;

export function parseMercadoPagoResourceId(
  raw: string | number | null | undefined
): string | null {
  if (raw == null) return null;
  const id = String(raw).trim();
  if (!MP_RESOURCE_ID_RE.test(id)) return null;
  return id;
}

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "MERCADOPAGO_ACCESS_TOKEN não configurado. Defina no Vercel (somente backend)."
    );
  }
  return token;
}

/** Diagnóstico do token SEM expor o valor. Nunca logar o token completo. */
export function getMercadoPagoTokenFingerprint(): {
  tokenConfigured: boolean;
  tokenPrefix: string;
  tokenLength: number;
  environment: "sandbox" | "production" | "unknown";
} {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
  const sandbox = token.startsWith("TEST-");
  const production = token.startsWith("APP_USR-");
  return {
    tokenConfigured: token.length > 0,
    tokenPrefix: sandbox
      ? "TEST-****"
      : production
        ? "APP_USR-****"
        : token
          ? "OTHER"
          : "NONE",
    tokenLength: token.length,
    environment: sandbox ? "sandbox" : production ? "production" : "unknown",
  };
}

/**
 * Erro do gateway com mensagem segura para o cliente e detalhes só para log.
 * `message` permanece técnica (não deve ir para o browser).
 */
export class MercadoPagoApiError extends Error {
  readonly userMessage: string;
  readonly httpStatus: number;

  constructor(params: {
    technicalMessage: string;
    userMessage: string;
    httpStatus: number;
  }) {
    super(params.technicalMessage);
    this.name = "MercadoPagoApiError";
    this.userMessage = params.userMessage;
    this.httpStatus = params.httpStatus;
  }
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
  if (msg.includes("public_key") || msg.includes("public key")) {
    return "Public Key do Mercado Pago inválida. Verifique NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY (mesmo modo do Access Token).";
  }
  if (
    msg.includes("collector user without key") ||
    msg.includes("13253")
  ) {
    return "A conta Mercado Pago da loja precisa ter uma chave PIX cadastrada para gerar o QR Code.";
  }
  if (
    msg.includes("financial identity") ||
    msg.includes("financial_identity") ||
    msg.includes("use case") ||
    msg.includes("internal_error") ||
    msg.includes("internal error")
  ) {
    return PIX_USER_ERROR;
  }
  return raw;
}

/**
 * Formato exigido pela API de pagamentos:
 * yyyy-MM-dd'T'HH:mm:ss.000-03:00 (offset, não sufixo Z).
 * @see https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-payment/post
 */
export function formatMercadoPagoExpiration(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const hour = get("hour").padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}.000-03:00`;
}

/**
 * Chave de idempotência curta o bastante para o header X-Idempotency-Key (1–64).
 * Nova chave a cada geração de PIX — reutilizar a pendente é responsabilidade do banco.
 */
export function buildPixIdempotencyKey(orderId: string): string {
  const nonce = randomBytes(8).toString("hex");
  const safeOrder = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-24);
  return `pix${safeOrder}${nonce}`.slice(0, MERCADOPAGO_IDEMPOTENCY_KEY_MAX);
}

function sanitizePersonName(value: string): string {
  const cleaned = value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Cliente").slice(0, 100);
}

function pixNotificationUrl(): string | undefined {
  const url = notificationUrl();
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return undefined;
  }
  return url;
}

function mercadoPagoRequestId(response: Response): string | null {
  return (
    response.headers.get("x-request-id") ||
    response.headers.get("x-meli-session-id") ||
    null
  );
}

type MercadoPagoCause = {
  code?: string | number;
  description?: string;
  data?: string;
};

function logPixCreateFailure(params: {
  orderId: string;
  httpStatus: number;
  requestId: string | null;
  error?: string;
  message?: string;
  causes?: MercadoPagoCause[];
}): void {
  console.error("[MercadoPago][PIX]", {
    orderId: params.orderId,
    httpStatus: params.httpStatus,
    errorCode: params.error ?? null,
    message: params.message ?? null,
    causes: (params.causes ?? []).map((cause) => ({
      code: cause.code ?? null,
      description: cause.description ?? null,
    })),
    requestId: params.requestId,
    ...getMercadoPagoTokenFingerprint(),
  });
}

export function pixUserMessageFromGateway(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("collector user without key") || msg.includes("13253")) {
    return mapMercadoPagoError(raw);
  }
  return PIX_USER_ERROR;
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
): Promise<{ checkoutUrl: string; preferenceId: string }> {
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
    signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
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
    console.error("Mercado Pago create preference failed:", {
      error: data.error,
      message: data.message,
      cause: data.cause?.[0]?.description,
    });
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

  return {
    preferenceId: data.id,
    checkoutUrl,
  };
}

export type MercadoPagoPaymentSnapshot = {
  id: string;
  status: string;
  statusDetail: string | null;
  amount: number;
  externalReference: string | null;
  paymentMethodId: string | null;
  dateOfExpiration: string | null;
  qrCode: string | null;
  qrCodeBase64: string | null;
  liveMode: boolean | null;
  dateApproved: string | null;
};

/** Reconsulta o pagamento no gateway (fonte da verdade — não confiar só no webhook). */
export async function fetchMercadoPagoPayment(
  paymentId: string
): Promise<MercadoPagoPaymentSnapshot> {
  const id = parseMercadoPagoResourceId(paymentId);
  if (!id) {
    throw new Error("ID de pagamento inválido.");
  }

  const accessToken = getAccessToken();
  const response = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
  });

  const data = (await response.json()) as {
    id?: number | string;
    status?: string;
    status_detail?: string;
    transaction_amount?: number;
    external_reference?: string | null;
    payment_method_id?: string;
    date_of_expiration?: string | null;
    live_mode?: boolean;
    date_approved?: string | null;
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
      };
    };
  };

  if (!response.ok || data.id == null) {
    throw new Error("Não foi possível validar o pagamento no gateway.");
  }

  const tx = data.point_of_interaction?.transaction_data;

  return {
    id: String(data.id),
    status: data.status ?? "",
    statusDetail: data.status_detail ?? null,
    amount: Number(data.transaction_amount ?? 0),
    externalReference: data.external_reference ?? null,
    paymentMethodId: data.payment_method_id ?? null,
    dateOfExpiration: data.date_of_expiration ?? null,
    qrCode: tx?.qr_code ?? null,
    qrCodeBase64: tx?.qr_code_base64 ?? null,
    liveMode: typeof data.live_mode === "boolean" ? data.live_mode : null,
    dateApproved: data.date_approved ?? null,
  };
}

export type CreatePixPaymentInput = {
  orderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerFirstName: string;
  payerLastName: string;
  cpf: string;
  idempotencyKey: string;
  expiresAt: Date;
};

/**
 * Payload oficial do PIX (Payments API) — alinhado ao sample da documentação:
 * transaction_amount, description, payment_method_id=pix, payer, date_of_expiration.
 * Sem statement_descriptor (campo de cartão; não consta no sample PIX).
 */
export function buildPixPaymentBody(input: CreatePixPaymentInput): {
  transaction_amount: number;
  description: string;
  payment_method_id: "pix";
  date_of_expiration: string;
  external_reference: string;
  notification_url?: string;
  payer: {
    email: string;
    first_name: string;
    last_name: string;
    identification: { type: "CPF"; number: string };
  };
} {
  const amount = Math.round(input.amount * 100) / 100;
  const notification_url = pixNotificationUrl();
  return {
    transaction_amount: amount,
    description: input.description.slice(0, 256),
    payment_method_id: "pix",
    date_of_expiration: formatMercadoPagoExpiration(input.expiresAt),
    external_reference: input.orderId,
    ...(notification_url ? { notification_url } : {}),
    payer: {
      email: input.payerEmail.trim().toLowerCase().slice(0, 254),
      first_name: sanitizePersonName(input.payerFirstName),
      last_name: sanitizePersonName(input.payerLastName),
      identification: {
        type: "CPF",
        number: input.cpf.replace(/\D/g, "").slice(0, 11),
      },
    },
  };
}

export type CreatedPixPayment = {
  paymentId: string;
  status: string;
  statusDetail: string | null;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: Date | null;
};

/**
 * PIX transparente: POST /v1/payments.
 * O valor DEVE vir do pedido no banco — nunca do cliente.
 */
export async function createPixPayment(
  input: CreatePixPaymentInput
): Promise<CreatedPixPayment> {
  const token = getAccessToken();
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0.01) {
    throw new Error("Valor do pagamento é inválido.");
  }

  const body = buildPixPaymentBody({ ...input, amount });
  const idempotencyKey = input.idempotencyKey.slice(
    0,
    MERCADOPAGO_IDEMPOTENCY_KEY_MAX
  );

  console.info("[MercadoPago][PIX] create request", {
    orderId: input.orderId,
    amount,
    expiration: body.date_of_expiration,
    idempotencyKeyLength: idempotencyKey.length,
    hasNotificationUrl: Boolean(body.notification_url),
    payerEmailDomain: body.payer.email.split("@")[1] ?? null,
    cpfLength: body.payer.identification.number.length,
    ...getMercadoPagoTokenFingerprint(),
  });

  const response = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MP_CREATE_PIX_TIMEOUT_MS),
  });

  const data = (await response.json()) as {
    id?: number | string;
    status?: string;
    status_detail?: string;
    date_of_expiration?: string | null;
    message?: string;
    error?: string;
    cause?: MercadoPagoCause[];
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
      };
    };
  };

  if (!response.ok || data.id == null) {
    const requestId = mercadoPagoRequestId(response);
    logPixCreateFailure({
      orderId: input.orderId,
      httpStatus: response.status,
      requestId,
      error: data.error,
      message: data.message,
      causes: data.cause,
    });
    const technical =
      data.cause?.[0]?.description ||
      data.message ||
      data.error ||
      "Falha ao gerar o pagamento PIX.";
    throw new MercadoPagoApiError({
      technicalMessage: technical,
      userMessage: pixUserMessageFromGateway(technical),
      httpStatus: response.status || 502,
    });
  }

  const tx = data.point_of_interaction?.transaction_data;
  const qrCode = tx?.qr_code?.trim() ?? "";
  const qrCodeBase64 = tx?.qr_code_base64?.trim() ?? "";

  if (!qrCode || !qrCodeBase64) {
    console.error("Mercado Pago PIX missing QR payload", {
      orderId: input.orderId,
      paymentId: String(data.id),
      status: data.status,
    });
    throw new Error("O Mercado Pago não retornou o QR Code do PIX.");
  }

  return {
    paymentId: String(data.id),
    status: data.status ?? "pending",
    statusDetail: data.status_detail ?? null,
    qrCode,
    qrCodeBase64,
    expiresAt: data.date_of_expiration
      ? new Date(data.date_of_expiration)
      : input.expiresAt,
  };
}

/** Cancela um pagamento pendente (PIX expirado / substituído / pedido já pago por outro meio). */
export async function cancelMercadoPagoPayment(paymentId: string): Promise<void> {
  const id = parseMercadoPagoResourceId(paymentId);
  if (!id) return;

  const token = getAccessToken();
  const response = await fetch(`${MP_API}/v1/payments/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `ddl-cancel-${id}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
    signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
  });

  if (response.ok || response.status === 404) return;

  const data = (await response.json()) as {
    status?: string;
    message?: string;
    cause?: Array<{ description?: string; code?: number }>;
  };

  const alreadyTerminal =
    data.status === "cancelled" ||
    data.status === "approved" ||
    String(data.cause?.[0]?.code ?? "").includes("2000");

  if (alreadyTerminal) return;

  console.warn("Mercado Pago cancel payment failed:", {
    paymentId: id,
    httpStatus: response.status,
    message: data.message,
    cause: data.cause?.[0]?.description,
  });
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

  const tsNumber = Number(ts);
  if (Number.isFinite(tsNumber)) {
    // MP pode enviar ts em segundos (10 dígitos) ou milissegundos (13).
    // Normaliza para ms antes de comparar (segundos → *1000) evitando 401 espúrio.
    const tsMs = ts.trim().length <= 10 ? tsNumber * 1000 : tsNumber;
    // Janela folgada evita falso 401 por skew de relógio.
    const skew = Math.abs(Date.now() - tsMs);
    if (skew > 15 * 60 * 1000) return false;
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
