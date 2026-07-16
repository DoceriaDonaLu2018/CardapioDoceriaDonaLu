import { Pencil, Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { deleteCategory } from "@/app/admin/categorias/actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { CategoryFormDialog } from "./category-form-dialog";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Categorias
          </h1>
          <p className="mt-1 text-stone-500">
            Organize as seções do cardápio.
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

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Ordem</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-center">Produtos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-stone-500"
                >
                  Nenhuma categoria cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium text-stone-500">
                    {category.order}
                  </TableCell>
                  <TableCell className="font-medium text-stone-800">
                    {category.name}
                  </TableCell>
                  <TableCell className="text-stone-500">
                    <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                      {category.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-center text-stone-600">
                    {category._count.products}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <CategoryFormDialog
                        category={category}
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
                        title="Excluir categoria"
                        description={`Tem certeza que deseja excluir "${category.name}"? Todos os produtos dessa categoria também serão removidos.`}
                        onConfirm={deleteCategory.bind(null, category.id)}
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
