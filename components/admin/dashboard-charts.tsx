"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPrice } from "@/lib/format";
import type {
  DailySales,
  PaymentMethodStats,
  TopProduct,
} from "@/lib/dashboard-metrics";

interface TopProductsChartProps {
  data: TopProduct[];
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  if (data.length === 0) {
    return (
      <p className="flex h-[280px] items-center justify-center text-sm text-stone-400">
        Sem vendas concluídas neste mês.
      </p>
    );
  }

  const chartData = data.map((item) => ({
    name:
      item.title.length > 16 ? `${item.title.slice(0, 16)}…` : item.title,
    fullName: item.title,
    quantidade: item.quantity,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -12, bottom: 48 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#78716c" }}
            interval={0}
            angle={-28}
            textAnchor="end"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#78716c" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(207, 45, 108, 0.06)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e7e5e4",
              fontSize: 12,
            }}
            formatter={(value) => [value ?? 0, "Qtd. vendida"]}
            labelFormatter={(_, payload) => {
              const full = payload?.[0]?.payload?.fullName;
              return typeof full === "string" ? full : "";
            }}
          />
          <Bar
            dataKey="quantidade"
            fill="#cf2d6c"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface WeeklyEvolutionChartProps {
  data: DailySales[];
}

export function WeeklyEvolutionChart({ data }: WeeklyEvolutionChartProps) {
  const hasSales = data.some((day) => day.revenue > 0);

  if (!hasSales) {
    return (
      <p className="flex h-[180px] items-center justify-center text-sm text-stone-400">
        Sem faturamento nos últimos 7 dias.
      </p>
    );
  }

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#78716c" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#78716c" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) =>
              value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
            }
          />
          <Tooltip
            cursor={{ fill: "rgba(207, 45, 108, 0.06)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e7e5e4",
              fontSize: 12,
            }}
            formatter={(value) => [
              formatPrice(typeof value === "number" ? value : Number(value) || 0),
              "Receita",
            ]}
          />
          <Bar
            dataKey="revenue"
            fill="#e14b85"
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PAYMENT_BAR_COLORS = ["#cf2d6c", "#e14b85", "#a16207"] as const;

interface PaymentMethodsChartProps {
  data: PaymentMethodStats[];
}

export function PaymentMethodsChart({ data }: PaymentMethodsChartProps) {
  if (data.length === 0) {
    return (
      <p className="flex h-[260px] items-center justify-center text-sm text-stone-400">
        Sem formas de pagamento registradas ainda.
      </p>
    );
  }

  const chartData = data.map((item, index) => ({
    name: item.label,
    pedidos: item.orderCount,
    receita: item.revenue,
    fill: PAYMENT_BAR_COLORS[index % PAYMENT_BAR_COLORS.length],
  }));

  return (
    <div className="space-y-4">
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e7e5e4"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "#78716c" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#78716c" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) =>
                value >= 1000
                  ? `${(value / 1000).toFixed(0)}k`
                  : String(value)
              }
            />
            <Tooltip
              cursor={{ fill: "rgba(207, 45, 108, 0.06)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e7e5e4",
                fontSize: 12,
              }}
              formatter={(value, _name, item) => {
                const payload = item?.payload as
                  | { pedidos?: number; receita?: number }
                  | undefined;
                const pedidos = payload?.pedidos ?? 0;
                const receita =
                  typeof value === "number" ? value : Number(value) || 0;
                return [
                  `${formatPrice(receita)} · ${pedidos} pedido${pedidos === 1 ? "" : "s"}`,
                  "Total",
                ];
              }}
            />
            <Bar
              dataKey="receita"
              name="receita"
              radius={[6, 6, 0, 0]}
              maxBarSize={64}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Números exatos abaixo do gráfico (fonte da verdade da query). */}
      <ul className="grid gap-2 sm:grid-cols-3">
        {data.map((item, index) => (
          <li
            key={item.method}
            className="rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    PAYMENT_BAR_COLORS[index % PAYMENT_BAR_COLORS.length],
                }}
                aria-hidden
              />
              <p className="text-sm font-semibold text-stone-800">{item.label}</p>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {item.orderCount} pedido{item.orderCount === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-sm font-medium text-coffee-700">
              {formatPrice(item.revenue)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
