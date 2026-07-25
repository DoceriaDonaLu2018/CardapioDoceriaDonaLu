"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Pencil, Search } from "lucide-react";
import type { Category, Product } from "@prisma/client";

import { deleteProduct } from "@/app/admin/produtos/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { ProductFormSheet } from "./product-form-sheet";

type ProductRow = Product & {
  category: Category | null;
};

interface ProdutosClientProps {
  products: ProductRow[];
  categories: Category[];
}

export function ProdutosClient({ products, categories }: ProdutosClientProps) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");

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

  return (
    <div className="space-y-4">
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

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Imagem</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-stone-500"
                >
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="relative h-12 w-16 overflow-hidden rounded-md bg-stone-100">
                      <Image
                        src={product.imageUrl}
                        alt={product.title}
                        fill
                        sizes="64px"
                        className="object-cover"
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
                    {product.isAvailable ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Disponível
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                        Indisponível
                      </span>
                    )}
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
