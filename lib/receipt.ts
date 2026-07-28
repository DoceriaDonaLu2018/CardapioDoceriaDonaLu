export type KitchenReceiptItem = {
  quantity: number;
  title: string;
  unitPrice: number;
};

export type KitchenReceiptData = {
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  waiterName?: string | null;
  createdAt: string;
  totalAmount: number;
  advancePayment: number;
  /** Valor bruto do banco (`paymentMethod`) — pode ser null em pedidos antigos/PDV. */
  paymentMethod?: string | null;
  /** HH:mm — horário de retirada/entrega escolhido no checkout. */
  pickupTime?: string | null;
  /** YYYY-MM-DD — preenchido em encomenda. */
  deliveryDate?: string | null;
  items: KitchenReceiptItem[];
};

type OrderForReceipt = {
  id: string;
  customerName: string;
  customerPhone?: string | null;
  waiterName?: string | null;
  createdAt: Date;
  totalAmount: number;
  advancePayment?: number | null;
  paymentMethod?: string | null;
  pickupTime?: string | null;
  deliveryDate?: string | null;
  items: {
    quantity: number;
    priceAtTime: number;
    productTitle?: string | null;
    product?: { title: string } | null;
  }[];
};

/**
 * Normaliza valores brutos (PDV + Mercado Pago) para buckets de métrica/exibição.
 * Retorna null para vazio — pedidos antigos sem forma de pagamento.
 */
export function canonicalizePaymentMethod(
  method: string | null | undefined
): "pix" | "cash" | "credit_card" | "debit_card" | "other" | null {
  if (!method || !method.trim()) return null;

  const key = method.trim().toLowerCase();

  if (key === "pix") return "pix";
  if (key === "cash" || key === "dinheiro") return "cash";
  if (
    key === "debit_card" ||
    key === "debit" ||
    key === "debvisa" ||
    key === "debmaster" ||
    key === "elo_debit"
  ) {
    return "debit_card";
  }
  if (
    key === "card" ||
    key === "credit_card" ||
    key === "credit" ||
    key === "visa" ||
    key === "master" ||
    key === "mastercard" ||
    key === "amex" ||
    key === "elo" ||
    key === "hipercard"
  ) {
    return "credit_card";
  }

  return "other";
}

/**
 * Traduz o valor técnico de `Order.paymentMethod` para texto da notinha.
 * Pedidos sem método (PDV antigo / null) → "Não informado".
 */
export function formatPaymentMethodLabel(
  method: string | null | undefined
): string {
  if (!method || !method.trim()) return "Não informado";

  const key = method.trim().toLowerCase();
  const canonical = canonicalizePaymentMethod(key);

  switch (canonical) {
    case "pix":
      return "Pix";
    case "cash":
      return "Dinheiro";
    case "credit_card":
      return "Cartão de Crédito";
    case "debit_card":
      return "Cartão de Débito";
    default:
      if (key === "account_money") return "Saldo Mercado Pago";
      if (key === "checkout_pro") return "Mercado Pago";
      return method.trim();
  }
}

function formatDeliveryDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function toKitchenReceiptData(order: OrderForReceipt): KitchenReceiptData {
  return {
    orderId: order.id,
    customerName: order.customerName,
    customerPhone: order.customerPhone ?? null,
    waiterName: order.waiterName ?? null,
    createdAt: order.createdAt.toISOString(),
    totalAmount: order.totalAmount,
    advancePayment: order.advancePayment ?? 0,
    paymentMethod: order.paymentMethod ?? null,
    pickupTime: order.pickupTime ?? null,
    deliveryDate: order.deliveryDate ?? null,
    items: order.items.map(
      (item): KitchenReceiptItem => ({
        quantity: item.quantity,
        title:
          (item.productTitle && item.productTitle.trim()) ||
          item.product?.title ||
          "Produto removido",
        unitPrice: item.priceAtTime,
      })
    ),
  };
}

export { formatDeliveryDateBr };
