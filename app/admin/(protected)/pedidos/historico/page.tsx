import { prisma } from "@/lib/prisma";
import {
  getOrderDateFilter,
  type OrderPeriod,
} from "@/lib/order-period";
import { HistoricoTable } from "@/components/admin/historico-table";
import { OrderPeriodFilter } from "@/components/admin/order-period-filter";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set(["today", "week", "month", "all"]);

interface HistoricoPageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function HistoricoPedidosPage({
  searchParams,
}: HistoricoPageProps) {
  const params = (await searchParams) ?? {};
  const rawPeriod = params.period;
  const period: OrderPeriod = VALID_PERIODS.has(rawPeriod ?? "")
    ? (rawPeriod as OrderPeriod)
    : "all";

  const dateFilter = getOrderDateFilter(period);

  let orders: Awaited<
    ReturnType<
      typeof prisma.order.findMany<{
        include: { items: { include: { product: true } } };
      }>
    >
  > = [];
  let loadError: string | null = null;

  try {
    orders = await prisma.order.findMany({
      where: {
        status: "COMPLETED",
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { product: true },
        },
      },
    });
  } catch (error) {
    console.error("historico pedidos:", error);
    loadError =
      "Não foi possível carregar o histórico. Verifique se o banco de dados está atualizado.";
  }

  const serializedOrders = orders.map((order) => ({
    id: order.id,
    customerName: order.customerName,
    waiterName: order.waiterName,
    createdAt: order.createdAt.toISOString(),
    totalAmount: order.totalAmount,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      priceAtTime: item.priceAtTime,
      product: { title: item.product.title },
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Histórico de Pedidos
        </h1>
        <p className="mt-1 text-stone-500">
          Consulte as comandas finalizadas por período.
        </p>
      </div>

      <OrderPeriodFilter current={period} />

      {loadError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {loadError}
        </p>
      )}

      <HistoricoTable orders={serializedOrders} />
    </div>
  );
}
