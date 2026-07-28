"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Minus, Package, Plus } from "lucide-react";

import { setProductStock } from "@/app/admin/estoque/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EstoqueProduct = {
  id: string;
  title: string;
  imageUrl: string;
  price: number;
  stockQuantity: number;
  isAvailable: boolean;
  categoryName: string;
};

export function EstoqueClient({ products }: { products: EstoqueProduct[] }) {
  const [rows, setRows] = useState(products);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyStock(productId: string, next: number) {
    const clamped = Math.max(0, Math.min(1_000_000, Math.floor(next)));
    setError(null);
    setPendingId(productId);
    startTransition(async () => {
      const result = await setProductStock(productId, clamped);
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.id === productId
            ? { ...row, stockQuantity: result.stockQuantity ?? clamped }
            : row
        )
      );
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 bg-white py-12 text-center text-sm text-stone-500">
        Nenhum produto cadastrado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {rows.map((product) => {
          const busy = isPending && pendingId === product.id;
          const soldOut = product.stockQuantity <= 0;

          return (
            <li
              key={product.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-800">
                    {product.title}
                  </p>
                  <p className="text-xs text-stone-500">
                    {product.categoryName} · {formatPrice(product.price)}
                    {!product.isAvailable && " · oculto na vitrine"}
                  </p>
                  {soldOut && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      <Package className="h-3 w-3" />
                      Esgotado na vitrine
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={busy || product.stockQuantity <= 0}
                  aria-label="Diminuir estoque"
                  onClick={() =>
                    applyStock(product.id, product.stockQuantity - 1)
                  }
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1_000_000}
                  className="h-9 w-20 text-center"
                  value={product.stockQuantity}
                  disabled={busy}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setRows((current) =>
                      current.map((row) =>
                        row.id === product.id
                          ? {
                              ...row,
                              stockQuantity: Number.isFinite(value)
                                ? value
                                : row.stockQuantity,
                            }
                          : row
                      )
                    );
                  }}
                  onBlur={() => applyStock(product.id, product.stockQuantity)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={busy}
                  aria-label="Aumentar estoque"
                  onClick={() =>
                    applyStock(product.id, product.stockQuantity + 1)
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {busy && (
                  <Loader2
                    className={cn("h-4 w-4 animate-spin text-stone-400")}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
