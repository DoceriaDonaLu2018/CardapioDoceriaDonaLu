"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Minus, Package, Plus, Search } from "lucide-react";

import {
  bulkUpdateProductStock,
  setProductStock,
} from "@/app/admin/estoque/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<Record<string, number>>({});
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSaving, startBulkTransition] = useTransition();

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

  const filteredIds = useMemo(
    () => filtered.map((product) => product.id),
    [filtered]
  );

  const allVisibleSelected =
    filteredIds.length > 0 &&
    filteredIds.every((id) => selectedIds.has(id));

  const someVisibleSelected =
    filteredIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  const selectedProducts = useMemo(
    () => rows.filter((product) => selectedIds.has(product.id)),
    [rows, selectedIds]
  );

  function toggleOne(productId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function openBulkModal() {
    if (selectedProducts.length === 0) return;
    const draft: Record<string, number> = {};
    for (const product of selectedProducts) {
      draft[product.id] = product.stockQuantity;
    }
    setBulkDraft(draft);
    setBulkError(null);
    setBulkOpen(true);
  }

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

  function submitBulk() {
    const payload = selectedProducts.map((product) => ({
      id: product.id,
      newStock: Math.max(
        0,
        Math.min(1_000_000, Math.floor(bulkDraft[product.id] ?? 0))
      ),
    }));

    setBulkError(null);
    startBulkTransition(async () => {
      const result = await bulkUpdateProductStock(payload);
      if (result.error) {
        setBulkError(result.error);
        return;
      }

      const stockById = new Map(
        payload.map((item) => [item.id, item.newStock] as const)
      );
      setRows((current) =>
        current.map((row) =>
          stockById.has(row.id)
            ? { ...row, stockQuantity: stockById.get(row.id)! }
            : row
        )
      );
      setSelectedIds(new Set());
      setBulkOpen(false);
      setBulkDraft({});
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
    <div className="space-y-4 pb-24">
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
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center gap-3 border-b border-stone-100 bg-stone-50 px-4 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected;
              }}
              onChange={(event) => toggleAllVisible(event.target.checked)}
              aria-label="Selecionar todos os produtos visíveis"
            />
            <span className="text-sm font-medium text-stone-600">
              Selecionar todos ({filtered.length})
            </span>
          </div>

          <ul className="divide-y divide-stone-100">
            {filtered.map((product) => {
              const busy = isPending && pendingId === product.id;
              const soldOut = product.stockQuantity <= 0;
              const checked = selectedIds.has(product.id);

              return (
                <li
                  key={product.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-stone-300"
                      checked={checked}
                      onChange={(event) =>
                        toggleOne(product.id, event.target.checked)
                      }
                      aria-label={`Selecionar ${product.title}`}
                    />
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

                  <div className="flex items-center gap-2 pl-7 sm:pl-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      disabled={busy || product.stockQuantity <= 0 || bulkSaving}
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
                      disabled={busy || bulkSaving}
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
                      disabled={busy || bulkSaving}
                      aria-label="Aumentar estoque"
                      onClick={() =>
                        applyStock(product.id, product.stockQuantity + 1)
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {busy && (
                      <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(100%-1.5rem,32rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-coffee-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-stone-700">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-coffee-600 text-white hover:bg-coffee-700"
              onClick={openBulkModal}
            >
              Atualizar Estoque Selecionado
            </Button>
          </div>
        </div>
      )}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Atualizar estoque em lote</DialogTitle>
            <DialogDescription>
              Informe a nova quantidade para cada produto selecionado. A
              gravação é atômica: ou todos salvam, ou nenhum.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {selectedProducts.map((product) => (
              <li
                key={product.id}
                className="rounded-lg border border-stone-200 bg-stone-50/80 p-3"
              >
                <p className="truncate text-sm font-medium text-stone-800">
                  {product.title}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  Atual: {product.stockQuantity}
                </p>
                <div className="mt-2 space-y-1">
                  <Label htmlFor={`bulk-stock-${product.id}`}>
                    Nova quantidade
                  </Label>
                  <Input
                    id={`bulk-stock-${product.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1_000_000}
                    disabled={bulkSaving}
                    value={bulkDraft[product.id] ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setBulkDraft((current) => ({
                        ...current,
                        [product.id]: Number.isFinite(value)
                          ? value
                          : current[product.id] ?? 0,
                      }));
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {bulkError && (
            <p className="text-sm text-red-600">{bulkError}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={bulkSaving}
              onClick={() => setBulkOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={bulkSaving || selectedProducts.length === 0}
              className="bg-coffee-600 text-white hover:bg-coffee-700"
              onClick={submitBulk}
            >
              {bulkSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                `Salvar ${selectedProducts.length} produto(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
