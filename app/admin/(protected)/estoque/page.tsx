import { prisma } from "@/lib/prisma";
import { EstoqueClient } from "./estoque-client";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const products = await prisma.product.findMany({
    where: { isDeleted: false },
    orderBy: [{ category: { order: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      imageUrl: true,
      price: true,
      stockQuantity: true,
      isAvailable: true,
      category: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Estoque
        </h1>
        <p className="mt-1 text-stone-500">
          Ajuste as quantidades. Ao zerar, o produto fica como Esgotado na
          vitrine.
        </p>
      </div>

      <EstoqueClient
        products={products.map((product) => ({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          price: product.price,
          stockQuantity: product.stockQuantity,
          isAvailable: product.isAvailable,
          categoryName: product.category?.name ?? "Sem categoria",
        }))}
      />
    </div>
  );
}
