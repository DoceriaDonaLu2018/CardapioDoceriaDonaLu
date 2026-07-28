"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Minus, Package, Plus, Search } from "lucide-react";

import { setProductStock } from "@/app/admin/estoque/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EstoqueCategory = {
  id: string;
  name: string;
};

export type EstoqueProduct = {
  id: string;
  title: string;
  imageUrl: string;
  price: number;
  stockQuantity: number;
  isAvailable: boolean;
  categoryId: string | null;
  categoryName: string;
};

export function EstoqueClient({
  products,
  categories,
}: {
  products: EstoqueProduct[];
  categories: EstoqueCategory[];
}) {
  const [rows, setRows] = useState(products);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((product) => {
      const matchesCategory =
        categoryId === "all"
          ? true
          : categoryId === "none"
            ? !product.categoryId
            : product.categoryId === categoryId;
      const matchesSearch =
        !query || product.title.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [rows, categoryId, search]);

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          type="search"
          placeholder="Buscar produto pelo título..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="bg-white pl-9"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setCategoryId("all")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            categoryId === "all"
              ? "border-coffee-600 bg-coffee-600 text-white"
              : "border-stone-200 bg-white text-stone-600 hover:border-coffee-300 hover:text-coffee-700"
          )}
        >
          Todos
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              categoryId === category.id
                ? "border-coffee-600 bg-coffee-600 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-coffee-300 hover:text-coffee-700"
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white py-12 text-center text-sm text-stone-500">
          Nenhum produto encontrado.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {filtered.map((product) => {
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
                    onBlur={() =>
                      applyStock(product.id, product.stockQuantity)
                    }
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
      )}
    </div>
  );
}
