import { prisma } from "@/lib/prisma";
import { PdvClient } from "./pdv-client";

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage() {
  const products = await prisma.product.findMany({
    where: { isAvailable: true, isDeleted: false },
    orderBy: [{ category: { order: "asc" } }, { title: "asc" }],
    include: { category: true },
  });

  const pdvProducts = products.map((product) => ({
    id: product.id,
    title: product.title,
    price: product.price,
    imageUrl: product.imageUrl,
    categoryName: product.category?.name ?? "Sem categoria",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          Novo Pedido
        </h1>
        <p className="mt-1 text-stone-500">
          Monte a comanda e finalize o pedido do cliente.
        </p>
      </div>

      <PdvClient products={pdvProducts} />
    </div>
  );
}
