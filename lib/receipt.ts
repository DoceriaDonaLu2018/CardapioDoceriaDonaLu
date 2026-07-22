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
  items: {
    quantity: number;
    priceAtTime: number;
    productTitle?: string | null;
    product?: { title: string } | null;
  }[];
};

export function toKitchenReceiptData(order: OrderForReceipt): KitchenReceiptData {
  return {
    orderId: order.id,
    customerName: order.customerName,
    customerPhone: order.customerPhone ?? null,
    waiterName: order.waiterName ?? null,
    createdAt: order.createdAt.toISOString(),
    totalAmount: order.totalAmount,
    // Pedidos antigos não possuem sinal: tratamos como 0.
    advancePayment: order.advancePayment ?? 0,
    items: order.items.map(
      (item): KitchenReceiptItem => ({
        quantity: item.quantity,
        // Preferir snapshot; fallback para relação (pedidos antigos / soft delete).
        title:
          (item.productTitle && item.productTitle.trim()) ||
          item.product?.title ||
          "Produto removido",
        unitPrice: item.priceAtTime,
      })
    ),
  };
}
