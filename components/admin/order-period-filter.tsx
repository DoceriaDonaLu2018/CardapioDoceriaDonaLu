import Link from "next/link";

import { cn } from "@/lib/utils";
import { ORDER_PERIODS, type OrderPeriod } from "@/lib/order-period";

interface OrderPeriodFilterProps {
  current: OrderPeriod;
}

export function OrderPeriodFilter({ current }: OrderPeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ORDER_PERIODS.map(({ value, label }) => (
        <Link
          key={value}
          href={`/admin/pedidos/historico?period=${value}`}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            current === value
              ? "border-coffee-600 bg-coffee-600 text-white"
              : "border-stone-200 bg-white text-stone-600 hover:border-coffee-300 hover:text-coffee-700"
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
