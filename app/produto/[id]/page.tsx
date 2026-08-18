import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation/safe-input";
import { CatalogShell } from "@/components/catalog/catalog-shell";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProdutoPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  const [product, categories] = await Promise.all([
    prisma.product.findFirst({
      where: {
        id: parsedId.data,
        isAvailable: true,
        isDeleted: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        price: true,
        stockQuantity: true,
        modifierGroups: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            minSelections: true,
            maxSelections: true,
            options: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                name: true,
                price: true,
                maxQuantityPerOption: true,
              },
            },
          },
        },
      },
    }),
    prisma.category.findMany({
      orderBy: { order: "asc" },
      select: {
        slug: true,
        name: true,
        products: {
          where: { isAvailable: true, isDeleted: false },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);

  if (!product) notFound();

  const headerCategories = categories
    .filter((c) => c.products.length > 0)
    .map((c) => ({ id: c.slug, label: c.name }));

  return (
      <CatalogShell categories={headerCategories} footer={<Footer />}>
      <div className="container max-w-lg py-8">
        <Button
          asChild
          variant="ghost"
          className="mb-4 -ml-2 text-stone-600 hover:text-coffee-700"
        >
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao cardápio
          </Link>
        </Button>

        <ProductCard product={product} className="mx-auto max-w-sm" />

        <p className="mt-6 text-center text-sm text-stone-500">
          Toque no produto para ver detalhes
          {product.modifierGroups.length > 0
            ? " e escolher os complementos"
            : ""}
          .
        </p>
      </div>
    </CatalogShell>
  );
}
