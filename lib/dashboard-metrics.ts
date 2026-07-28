import { prisma } from "@/lib/prisma";
import {
  canonicalizePaymentMethod,
  formatPaymentMethodLabel,
} from "@/lib/receipt";
import { BRASILIA_TZ, getBrasiliaStartOfDay, subtractDays } from "@/lib/timezone";

export type PeriodMetrics = {
  revenue: number;
  cost: number;
  profit: number;
  margin: number; // percentual 0–100
  orderCount: number;
};

export type TopProduct = {
  productId: string;
  title: string;
  quantity: number;
};

export type CategorySales = {
  categoryName: string;
  revenue: number;
};

export type DailySales = {
  date: string; // YYYY-MM-DD (Brasília)
  label: string; // ex.: "seg 14"
  revenue: number;
};

export type PreferredPaymentMethod = {
  /** rótulo amigável (ex.: "Pix") ou null se não houver dados */
  label: string | null;
  /** valor canônico: pix | cash | credit_card | debit_card | other */
  method: string | null;
  count: number;
};

export type DashboardData = {
  today: PeriodMetrics;
  week: PeriodMetrics;
  month: PeriodMetrics;
  topProducts: TopProduct[];
  categorySales: CategorySales[];
  weeklyEvolution: DailySales[];
  preferredPaymentMethod: PreferredPaymentMethod;
};

type RawTotals = {
  revenue: number | string | null;
  cost: number | string | null;
  order_count: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildMetrics(row: RawTotals | undefined): PeriodMetrics {
  const revenue = toNumber(row?.revenue);
  const cost = toNumber(row?.cost);
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    revenue,
    cost,
    profit,
    margin,
    orderCount: toNumber(row?.order_count),
  };
}

/** Meia-noite do 1º dia do mês civil atual em Brasília, como Date UTC. */
function getBrasiliaStartOfMonth(reference = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(reference);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;

  return new Date(`${year}-${month}-01T03:00:00.000Z`);
}

/**
 * Uma única varredura de order_items para today / week / month
 * (antes eram 3 queries quase idênticas).
 */
async function getPeriodMetricsBatch(
  startOfToday: Date,
  startOfWeek: Date,
  startOfMonth: Date
): Promise<{ today: PeriodMetrics; week: PeriodMetrics; month: PeriodMetrics }> {
  type BatchRow = {
    today_revenue: number | string | null;
    today_cost: number | string | null;
    today_orders: number | string | null;
    week_revenue: number | string | null;
    week_cost: number | string | null;
    week_orders: number | string | null;
    month_revenue: number | string | null;
    month_cost: number | string | null;
    month_orders: number | string | null;
  };

  // SQLi: tagged template Prisma (= prepared statement). Nunca use $queryRawUnsafe.
  const rows = await prisma.$queryRaw<BatchRow[]>`
    SELECT
      COALESCE(SUM(oi."priceAtTime" * oi.quantity) FILTER (WHERE o."createdAt" >= ${startOfToday}), 0) AS today_revenue,
      COALESCE(SUM(oi."costAtTime" * oi.quantity) FILTER (WHERE o."createdAt" >= ${startOfToday}), 0) AS today_cost,
      COUNT(DISTINCT o.id) FILTER (WHERE o."createdAt" >= ${startOfToday})::int AS today_orders,
      COALESCE(SUM(oi."priceAtTime" * oi.quantity) FILTER (WHERE o."createdAt" >= ${startOfWeek}), 0) AS week_revenue,
      COALESCE(SUM(oi."costAtTime" * oi.quantity) FILTER (WHERE o."createdAt" >= ${startOfWeek}), 0) AS week_cost,
      COUNT(DISTINCT o.id) FILTER (WHERE o."createdAt" >= ${startOfWeek})::int AS week_orders,
      COALESCE(SUM(oi."priceAtTime" * oi.quantity) FILTER (WHERE o."createdAt" >= ${startOfMonth}), 0) AS month_revenue,
      COALESCE(SUM(oi."costAtTime" * oi.quantity) FILTER (WHERE o."createdAt" >= ${startOfMonth}), 0) AS month_cost,
      COUNT(DISTINCT o.id) FILTER (WHERE o."createdAt" >= ${startOfMonth})::int AS month_orders
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    WHERE o.status = 'COMPLETED'
      AND o."createdAt" >= ${startOfMonth}
  `;

  const row = rows[0];

  return {
    today: buildMetrics({
      revenue: row?.today_revenue,
      cost: row?.today_cost,
      order_count: row?.today_orders,
    }),
    week: buildMetrics({
      revenue: row?.week_revenue,
      cost: row?.week_cost,
      order_count: row?.week_orders,
    }),
    month: buildMetrics({
      revenue: row?.month_revenue,
      cost: row?.month_cost,
      order_count: row?.month_orders,
    }),
  };
}

/** Top 7 produtos mais vendidos no mês civil atual (quantidade). */
async function getTopProducts(limit = 7): Promise<TopProduct[]> {
  const since = getBrasiliaStartOfMonth();

  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: {
        status: "COMPLETED",
        createdAt: { gte: since },
      },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((row) => row.productId) } },
    select: { id: true, title: true },
  });

  const titleById = new Map(products.map((p) => [p.id, p.title]));

  return grouped.map((row) => ({
    productId: row.productId,
    title: titleById.get(row.productId) ?? "Produto removido",
    quantity: row._sum.quantity ?? 0,
  }));
}

/** Receita por categoria nos últimos 30 dias (agregado no banco). */
async function getCategorySales(since: Date): Promise<CategorySales[]> {
  type Row = { category_name: string; revenue: number | string | null };

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COALESCE(c.name, 'Sem categoria') AS category_name,
      COALESCE(SUM(oi."priceAtTime" * oi.quantity), 0) AS revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    INNER JOIN "Product" p ON p.id = oi."productId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE o.status = 'COMPLETED'
      AND o."createdAt" >= ${since}
    GROUP BY c.id, c.name
    ORDER BY revenue DESC
  `;

  return rows.map((row) => ({
    categoryName: row.category_name,
    revenue: toNumber(row.revenue),
  }));
}

/** Evolução diária de receita dos últimos 7 dias (fuso Brasília). */
async function getWeeklyEvolution(since: Date): Promise<DailySales[]> {
  type Row = { day: Date; revenue: number | string | null };

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      (DATE_TRUNC('day', o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${BRASILIA_TZ}))::date AS day,
      COALESCE(SUM(oi."priceAtTime" * oi.quantity), 0) AS revenue
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi."orderId"
    WHERE o.status = 'COMPLETED'
      AND o."createdAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  const byDay = new Map(
    rows.map((row) => {
      const iso =
        row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day).slice(0, 10);
      return [iso, toNumber(row.revenue)] as const;
    })
  );

  const labelFmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TZ,
    weekday: "short",
    day: "2-digit",
  });

  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const result: DailySales[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = subtractDays(getBrasiliaStartOfDay(), i);
    const date = dayFmt.format(dayStart);
    result.push({
      date,
      label: labelFmt.format(dayStart).replace(".", ""),
      revenue: byDay.get(date) ?? 0,
    });
  }

  return result;
}

/**
 * Método de pagamento mais usado (agregação no banco via groupBy).
 * Ignora pedidos antigos com paymentMethod null/vazio.
 * Agrupa bandeiras MP (visa, master…) nos buckets canônicos.
 */
async function getPreferredPaymentMethod(): Promise<PreferredPaymentMethod> {
  const empty: PreferredPaymentMethod = {
    label: null,
    method: null,
    count: 0,
  };

  try {
    const groups = await prisma.order.groupBy({
      by: ["paymentMethod"],
      where: {
        paymentMethod: { not: null },
        // Só vendas efetivas — alinhado às demais métricas financeiras.
        status: { in: ["COMPLETED", "PAID", "PENDING"] },
      },
      _count: { _all: true },
      orderBy: { _count: { paymentMethod: "desc" } },
    });

    const tallies = new Map<string, number>();

    for (const row of groups) {
      const raw = row.paymentMethod?.trim();
      if (!raw) continue; // fallback: null / string vazia

      const bucket = canonicalizePaymentMethod(raw) ?? "other";
      tallies.set(bucket, (tallies.get(bucket) ?? 0) + row._count._all);
    }

    if (tallies.size === 0) return empty;

    let winner: string | null = null;
    let winnerCount = 0;
    for (const [method, count] of tallies) {
      if (count > winnerCount) {
        winner = method;
        winnerCount = count;
      }
    }

    if (!winner) return empty;

    return {
      method: winner,
      label: formatPaymentMethodLabel(winner),
      count: winnerCount,
    };
  } catch (error) {
    console.error("getPreferredPaymentMethod:", error);
    return empty;
  }
}

/** Carrega todas as métricas do dashboard em paralelo. */
export async function getDashboardData(): Promise<DashboardData> {
  const startOfToday = getBrasiliaStartOfDay();
  const startOfWeek = subtractDays(startOfToday, 7);
  const startOfMonth = subtractDays(startOfToday, 30);

  const [
    periods,
    topProducts,
    categorySales,
    weeklyEvolution,
    preferredPaymentMethod,
  ] = await Promise.all([
    getPeriodMetricsBatch(startOfToday, startOfWeek, startOfMonth),
    getTopProducts(7),
    getCategorySales(startOfMonth),
    getWeeklyEvolution(startOfWeek),
    getPreferredPaymentMethod(),
  ]);

  return {
    today: periods.today,
    week: periods.week,
    month: periods.month,
    topProducts,
    categorySales,
    weeklyEvolution,
    preferredPaymentMethod,
  };
}
