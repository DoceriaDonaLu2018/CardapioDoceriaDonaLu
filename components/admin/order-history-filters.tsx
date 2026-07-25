"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_PERIODS, type OrderPeriod } from "@/lib/order-period";

interface OrderHistoryFiltersProps {
  currentPeriod: OrderPeriod;
  selectedDate?: string | null;
}

export function OrderHistoryFilters({
  currentPeriod,
  selectedDate = null,
}: OrderHistoryFiltersProps) {
  const router = useRouter();
  const usingDate = Boolean(selectedDate);

  function goToPeriod(period: OrderPeriod) {
    router.push(`/admin/pedidos/historico?period=${period}`);
  }

  function goToDate(date: string) {
    if (!date) {
      goToPeriod("all");
      return;
    }
    router.push(`/admin/pedidos/historico?date=${date}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {ORDER_PERIODS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => goToPeriod(value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              !usingDate && currentPeriod === value
                ? "border-coffee-600 bg-coffee-600 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-coffee-300 hover:text-coffee-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label
            htmlFor="history-date"
            className="flex items-center gap-1.5 text-xs text-stone-500"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Dia específico
          </Label>
          <Input
            id="history-date"
            type="date"
            value={selectedDate ?? ""}
            onChange={(event) => goToDate(event.target.value)}
            className={cn(
              "w-[11.5rem] bg-white",
              usingDate && "border-coffee-400 ring-1 ring-coffee-200"
            )}
          />
        </div>
        {usingDate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => goToPeriod("today")}
            aria-label="Limpar data"
            className="text-stone-500"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
