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

/** Estatística por forma de pagamento (já normalizada para buckets canônicos). */
export type PaymentMethodStats = {
  method: string;
  label: string;
  orderCount: number;
  /** Soma exata de Order.totalAmount no bucket (centavos arredondados). */
  revenue: number;
};

export type DashboardData = {
  today: PeriodMetrics;
  week: PeriodMetrics;
  month: PeriodMetrics;
  topProducts: TopProduct[];
  categorySales: CategorySales[];
  weeklyEvolution: DailySales[];
  preferredPaymentMethod: PreferredPaymentMethod;
  /** Top 3 formas de pagamento (pedidos + valor). */
  topPaymentMethods: PaymentMethodStats[];
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

/** Top 7 produtos mais vendidos no período informado (quantidade). */
async function getTopProducts(
  since: Date,
  limit = 7
): Promise<TopProduct[]> {

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

type PaymentMethodAgg = {
  orderCount: number;
  revenue: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Agrega formas de pagamento no banco (COUNT + SUM), normaliza buckets
 * (pix/card/master → canônicos) e devolve top N + preferido.
 * Ignora null/vazio. Prepared statement — sem input do usuário na SQL.
 */
async function getPaymentMethodBreakdown(limit = 3): Promise<{
  preferred: PreferredPaymentMethod;
  top: PaymentMethodStats[];
}> {
  const emptyPreferred: PreferredPaymentMethod = {
    label: null,
    method: null,
    count: 0,
  };

  type Row = {
    payment_method: string | null;
    order_count: number | string | null;
    revenue: number | string | null;
  };

  try {
    // SQLi-safe: tagged template Prisma. Sem interpolação de string do cliente.
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        o."paymentMethod" AS payment_method,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o."totalAmount"), 0) AS revenue
      FROM orders o
      WHERE o.status IN ('COMPLETED', 'PAID', 'PENDING')
        AND o."paymentMethod" IS NOT NULL
        AND BTRIM(o."paymentMethod") <> ''
      GROUP BY o."paymentMethod"
    `;

    const tallies = new Map<string, PaymentMethodAgg>();

    for (const row of rows) {
      const raw = row.payment_method?.trim();
      if (!raw) continue;

      const bucket = canonicalizePaymentMethod(raw) ?? "other";
      const prev = tallies.get(bucket) ?? { orderCount: 0, revenue: 0 };
      tallies.set(bucket, {
        orderCount: prev.orderCount + toNumber(row.order_count),
        revenue: prev.revenue + toNumber(row.revenue),
      });
    }

    if (tallies.size === 0) {
      return { preferred: emptyPreferred, top: [] };
    }

    const ranked = [...tallies.entries()]
      .map(([method, agg]) => ({
        method,
        label: formatPaymentMethodLabel(method),
        orderCount: agg.orderCount,
        revenue: roundMoney(agg.revenue),
      }))
      // Desempate estável: mais pedidos → maior receita → rótulo.
      .sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return a.label.localeCompare(b.label, "pt-BR");
      });

    const top = ranked.slice(0, Math.max(1, limit));
    const winner = ranked[0];

    return {
      preferred: {
        method: winner.method,
        label: winner.label,
        count: winner.orderCount,
      },
      top,
    };
  } catch (error) {
    console.error("getPaymentMethodBreakdown:", error);
    return { preferred: emptyPreferred, top: [] };
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
    paymentBreakdown,
  ] = await Promise.all([
    getPeriodMetricsBatch(startOfToday, startOfWeek, startOfMonth),
    getTopProducts(startOfMonth, 7),
    getCategorySales(startOfMonth),
    getWeeklyEvolution(startOfWeek),
    getPaymentMethodBreakdown(3),
  ]);

  return {
    today: periods.today,
    week: periods.week,
    month: periods.month,
    topProducts,
    categorySales,
    weeklyEvolution,
    preferredPaymentMethod: paymentBreakdown.preferred,
    topPaymentMethods: paymentBreakdown.top,
  };
}
