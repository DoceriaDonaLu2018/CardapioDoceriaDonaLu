/**
 * Parâmetros GET que o Mercado Pago anexa às back_urls após o checkout.
 * Ex.: payment_id, status, external_reference, collection_id, collection_status…
 *
 * @see https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/checkout-customization/user-interface/redirection
 */
export type MercadoPagoReturnParams = {
  paymentId: string | null;
  status: string | null;
  externalReference: string | null;
  merchantOrderId: string | null;
  preferenceId: string | null;
  paymentType: string | null;
};

function firstString(
  value: string | string[] | undefined
): string | null {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

export function parseMercadoPagoReturnParams(
  searchParams: Record<string, string | string[] | undefined>
): MercadoPagoReturnParams {
  return {
    // Docs: payment_id; legado: collection_id (mesmo valor na prática).
    paymentId:
      firstString(searchParams.payment_id) ||
      firstString(searchParams.collection_id),
    // Docs: status; legado: collection_status.
    status:
      firstString(searchParams.status) ||
      firstString(searchParams.collection_status),
    externalReference: firstString(searchParams.external_reference),
    merchantOrderId: firstString(searchParams.merchant_order_id),
    preferenceId: firstString(searchParams.preference_id),
    paymentType: firstString(searchParams.payment_type),
  };
}
