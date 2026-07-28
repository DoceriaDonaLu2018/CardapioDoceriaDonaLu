import { Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { CategoriesDndList } from "./categories-dnd-list";
import { CategoryFormDialog } from "./category-form-dialog";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: { products: { where: { isDeleted: false } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Categorias
          </h1>
          <p className="mt-1 text-stone-500">
            Organize as seções do cardápio arrastando e soltando.
          </p>
        </div>

        <CategoryFormDialog
          trigger={
            <Button className="bg-coffee-600 text-white hover:bg-coffee-700">
              <Plus className="h-4 w-4" />
              Nova Categoria
            </Button>
          }
        />
      </div>

      <CategoriesDndList
        initialCategories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          order: category.order,
          productCount: category._count.products,
        }))}
      />
    </div>
  );
}
