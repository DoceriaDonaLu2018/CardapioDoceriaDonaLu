import { formatPrice } from "@/lib/format";
import type { CategorySales } from "@/lib/dashboard-metrics";

interface CategorySalesListProps {
  data: CategorySales[];
}

/** Lista leve (sem Recharts) — pode ser Server Component. */
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
