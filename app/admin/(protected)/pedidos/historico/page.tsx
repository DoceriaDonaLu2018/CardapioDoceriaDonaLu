import { prisma } from "@/lib/prisma";
import {
  getOrderDateFilter,
  type OrderPeriod,
} from "@/lib/order-period";
import { getBrasiliaDayRange } from "@/lib/timezone";
import { HistoricoTable } from "@/components/admin/historico-table";
import { OrderHistoryFilters } from "@/components/admin/order-history-filters";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set(["today", "week", "month", "all"]);
const PAGE_SIZE = 50;

interface HistoricoPageProps {
  searchParams: Promise<{ period?: string; date?: string; page?: string }>;
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(10_000, Math.floor(n));
}

export default async function HistoricoPedidosPage({
  searchParams,
}: HistoricoPageProps) {
  const params = (await searchParams) ?? {};
  const rawPeriod = params.period;
  // Default "month" evita carregar o histórico inteiro na primeira visita.
  const period: OrderPeriod = VALID_PERIODS.has(rawPeriod ?? "")
    ? (rawPeriod as OrderPeriod)
    : "month";
  const selectedDate = params.date?.trim() || null;
  const dayRange = selectedDate ? getBrasiliaDayRange(selectedDate) : null;
  const page = parsePage(params.page);

  const createdAtFilter = dayRange
    ? { gte: dayRange.gte, lt: dayRange.lt }
    : getOrderDateFilter(period);

  const where = {
    status: "COMPLETED" as const,
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  let orders: Awaited<
    ReturnType<
      typeof prisma.order.findMany<{
        select: {
          id: true;
          customerName: true;
          customerPhone: true;
          waiterName: true;
          createdAt: true;
          totalAmount: true;
          advancePayment: true;
          paymentMethod: true;
          pickupTime: true;
          deliveryDate: true;
          items: {
            select: {
              quantity: true;
              priceAtTime: true;
              productTitle: true;
              modifiers: true;
              product: { select: { title: true } };
            };
          };
        };
      }>
    >
  > = [];
  let total = 0;
  let loadError: string | null = null;

  try {
    total = await prisma.order.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);

    orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        waiterName: true,
        createdAt: true,
        totalAmount: true,
        advancePayment: true,
        paymentMethod: true,
        pickupTime: true,
        deliveryDate: true,
        items: {
          select: {
            quantity: true,
            priceAtTime: true,
            productTitle: true,
            modifiers: true,
            product: { select: { title: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("historico pedidos:", error);
    loadError =
      "Não foi possível carregar o histórico. Verifique se o banco de dados está atualizado.";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const serializedOrders = orders.map((order) => ({
    id: order.id,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    waiterName: order.waiterName,
    createdAt: order.createdAt.toISOString(),
    totalAmount: order.totalAmount,
    advancePayment: order.advancePayment,
    paymentMethod: order.paymentMethod,
    pickupTime: order.pickupTime,
    deliveryDate: order.deliveryDate,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      priceAtTime: item.priceAtTime,
      productTitle: item.productTitle,
      modifiers: item.modifiers ?? null,
      product: {
        title:
          (item.productTitle && item.productTitle.trim()) ||
          item.product.title,
      },
    })),
  }));

  function hrefForPage(nextPage: number): string {
    const qs = new URLSearchParams();
    if (dayRange && selectedDate) {
      qs.set("date", selectedDate);
    } else {
      qs.set("period", period);
    }
    if (nextPage > 1) qs.set("page", String(nextPage));
    return `/admin/pedidos/historico?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Histórico de Pedidos
        </h1>
        <p className="mt-1 text-stone-500">
          Consulte as comandas finalizadas por período ou dia específico.
        </p>
      </div>

      <OrderHistoryFilters
        currentPeriod={period}
        selectedDate={dayRange ? selectedDate : null}
      />

      {loadError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {loadError}
        </p>
      )}

      <p className="text-sm text-stone-500">
        {total} pedido{total === 1 ? "" : "s"} neste filtro
        {totalPages > 1 ? ` · página ${safePage} de ${totalPages}` : ""}.
      </p>

      <HistoricoTable orders={serializedOrders} />

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          {safePage > 1 ? (
            <a
              href={hrefForPage(safePage - 1)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-coffee-300"
            >
              Anterior
            </a>
          ) : (
            <span />
          )}
          {safePage < totalPages ? (
            <a
              href={hrefForPage(safePage + 1)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-coffee-300"
            >
              Próxima
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
