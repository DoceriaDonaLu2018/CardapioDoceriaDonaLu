import Image from "next/image";
import { Pencil, Plus } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { deleteProduct } from "@/app/admin/produtos/actions";
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
import { ProductFormSheet } from "./product-form-sheet";

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
            {products.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-stone-500"
                >
                  Nenhum produto cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
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
