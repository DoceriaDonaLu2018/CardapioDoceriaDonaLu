import { getBrasiliaStartOfDay, subtractDays } from "@/lib/timezone";

export type OrderPeriod = "today" | "week" | "month" | "all";

export const ORDER_PERIODS: { value: OrderPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Últimos 7 dias" },
  { value: "month", label: "Últimos 30 dias" },
  { value: "all", label: "Todo o período" },
];

/** Retorna o filtro Prisma `createdAt` conforme o período (fuso de Brasília). */
export function getOrderDateFilter(period: string): { gte: Date } | undefined {
  const startOfToday = getBrasiliaStartOfDay();

  switch (period as OrderPeriod) {
    case "today":
      return { gte: startOfToday };
    case "week":
      return { gte: subtractDays(startOfToday, 7) };
    case "month":
      return { gte: subtractDays(startOfToday, 30) };
    default:
      return undefined;
  }
}

/** Resumo legível dos itens. Ex.: "2x Café, 1x Pão de Queijo" */
export function formatOrderSummary(
  items: {
    quantity: number;
    productTitle?: string | null;
    product?: { title: string } | null;
  }[]
): string {
  return items
    .map((item) => {
      const title =
        (item.productTitle && item.productTitle.trim()) ||
        item.product?.title ||
        "Produto removido";
      return `${item.quantity}x ${title}`;
    })
    .join(", ");
}

/** ID curto para exibição na tabela. */
export function formatOrderId(id: string): string {
  return id.slice(-8).toUpperCase();
}
