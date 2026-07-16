"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPrice } from "@/lib/format";
import type { CategorySales, DailySales, TopProduct } from "@/lib/dashboard-metrics";

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

interface CategorySalesListProps {
  data: CategorySales[];
}

export function CategorySalesList({ data }: CategorySalesListProps) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-stone-400">
        Sem vendas por categoria no período.
      </p>
    );
  }

  const max = Math.max(...data.map((item) => item.revenue), 1);

  return (
    <ul className="space-y-3">
      {data.map((item) => {
        const width = Math.max(4, (item.revenue / max) * 100);
        return (
          <li key={item.categoryName}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-stone-700">
                {item.categoryName}
              </span>
              <span className="shrink-0 font-semibold text-coffee-700">
                {formatPrice(item.revenue)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-coffee-500"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
