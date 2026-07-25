import { Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ProductFormSheet } from "./product-form-sheet";
import { ProdutosClient } from "./produtos-client";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false },
      orderBy: [{ category: { order: "asc" } }, { title: "asc" }],
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { order: "asc" } }),
  ]);

  const hasCategories = categories.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Produtos
          </h1>
          <p className="mt-1 text-stone-500">
            Gerencie os itens do cardápio.
          </p>
        </div>

        {hasCategories ? (
          <ProductFormSheet
            categories={categories}
            trigger={
              <Button className="bg-coffee-600 text-white hover:bg-coffee-700">
                <Plus className="h-4 w-4" />
                Novo Produto
              </Button>
            }
          />
        ) : (
          <p className="text-sm text-stone-500">
            Crie uma categoria antes de adicionar produtos.
          </p>
        )}
      </div>

      <ProdutosClient products={products} categories={categories} />
    </div>
  );
}
