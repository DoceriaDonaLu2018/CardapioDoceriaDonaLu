"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Pencil, Search, Trash2 } from "lucide-react";

import {
  bulkSetAvailability,
  bulkSoftDeleteProducts,
  deleteProduct,
  toggleProductAvailability,
} from "@/app/admin/produtos/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SafeImage } from "@/components/ui/safe-image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import {
  ProductFormSheet,
  type ProductFormCategory,
  type ProductFormValues,
} from "./product-form-sheet";

type ProductRow = ProductFormValues & {
  category: { id: string; name: string } | null;
};

interface ProdutosClientProps {
  products: ProductRow[];
  categories: ProductFormCategory[];
}

export function ProdutosClient({
  products: initialProducts,
  categories,
}: ProdutosClientProps) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
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
  }, [products, categoryId, search]);

  const filteredIds = useMemo(
    () => filtered.map((p) => p.id),
    [filtered]
  );
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someFilteredSelected = filteredIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAvailability(product: ProductRow, next: boolean) {
    const previous = product.isAvailable;
    setError(null);
    // Optimistic UI
    setProducts((rows) =>
      rows.map((row) =>
        row.id === product.id ? { ...row, isAvailable: next } : row
      )
    );

    startTransition(async () => {
      const result = await toggleProductAvailability(product.id, next);
      if (result.error) {
        setProducts((rows) =>
          rows.map((row) =>
            row.id === product.id ? { ...row, isAvailable: previous } : row
          )
        );
        setError(result.error);
      }
    });
  }

  function runBulk(
    action: "activate" | "deactivate" | "delete"
  ) {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (action === "delete") {
      const ok = window.confirm(
        `Excluir ${ids.length} produto(s)? Eles saem da vitrine (soft delete).`
      );
      if (!ok) return;
    }

    setError(null);
    const snapshot = products;

    // Optimistic
    if (action === "delete") {
      setProducts((rows) => rows.filter((row) => !selected.has(row.id)));
      setSelected(new Set());
    } else {
      const nextAvailable = action === "activate";
      setProducts((rows) =>
        rows.map((row) =>
          selected.has(row.id) ? { ...row, isAvailable: nextAvailable } : row
        )
      );
    }

    startTransition(async () => {
      const result =
        action === "delete"
          ? await bulkSoftDeleteProducts(ids)
          : await bulkSetAvailability(ids, action === "activate");

      if (result.error) {
        setProducts(snapshot);
        setSelected(new Set(ids));
        setError(result.error);
        return;
      }
      if (action !== "delete") setSelected(new Set());
    });
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

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-coffee-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur">
          <span className="text-sm font-medium text-stone-700">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk("activate")}
            >
              Ativar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk("deactivate")}
            >
              Desativar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              disabled={isPending}
              onClick={() => runBulk("delete")}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Excluir
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setSelected(new Set())}
            >
              Limpar
            </Button>
          </div>
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
          )}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        someFilteredSelected && !allFilteredSelected;
                    }
                  }}
                  onChange={toggleSelectAll}
                  aria-label="Selecionar todos da lista filtrada"
                />
              </TableHead>
              <TableHead className="w-20">Imagem</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead className="text-center">Disponível</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-stone-500"
                >
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((product) => (
                <TableRow
                  key={product.id}
                  className={cn(selected.has(product.id) && "bg-coffee-50/40")}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelectOne(product.id)}
                      aria-label={`Selecionar ${product.title}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="relative h-12 w-16 overflow-hidden rounded-md bg-stone-100">
                      <SafeImage
                        src={product.imageUrl}
                        alt={product.title}
                        fill
                        sizes="64px"
                        className="object-cover"
                        fallbackIconClassName="h-4 w-4"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-stone-800">
                    {product.title}
                  </TableCell>
                  <TableCell className="text-stone-600">
                    {product.category?.name ?? "Sem categoria"}
                  </TableCell>
                  <TableCell className="font-semibold text-coffee-700">
                    {formatPrice(product.price)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex flex-col items-center gap-1">
                      <Switch
                        checked={product.isAvailable}
                        disabled={isPending}
                        onCheckedChange={(checked) =>
                          handleToggleAvailability(product, checked)
                        }
                        aria-label={
                          product.isAvailable
                            ? `Desativar ${product.title}`
                            : `Ativar ${product.title}`
                        }
                      />
                      <span className="text-[10px] text-stone-500">
                        {product.isAvailable ? "Ativo" : "Off"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <ProductFormSheet
                        product={product}
                        categories={categories}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DeleteConfirmDialog
                        title="Excluir produto"
                        description={`Tem certeza que deseja excluir "${product.title}"?`}
                        onConfirm={deleteProduct.bind(null, product.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
