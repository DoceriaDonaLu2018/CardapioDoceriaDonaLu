import { prisma } from "@/lib/prisma";
import { PdvClient, type PdvInitialOrder } from "./pdv-client";

export const dynamic = "force-dynamic";

interface NovoPedidoPageProps {
  searchParams: Promise<{ orderId?: string }>;
}

export default async function NovoPedidoPage({
  searchParams,
}: NovoPedidoPageProps) {
  const params = (await searchParams) ?? {};
  const orderId = params.orderId?.trim() || null;

  const [products, order] = await Promise.all([
    prisma.product.findMany({
      where: { isAvailable: true, isDeleted: false },
      orderBy: [{ category: { order: "asc" } }, { title: "asc" }],
      include: { category: true },
    }),
    orderId
      ? prisma.order.findUnique({
          where: { id: orderId },
          include: {
            items: {
              include: { product: { select: { title: true, price: true } } },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const pdvProducts = products.map((product) => ({
    id: product.id,
    title: product.title,
    price: product.price,
    imageUrl: product.imageUrl,
    categoryName: product.category?.name ?? "Sem categoria",
  }));

  const canHydrate =
    order &&
    (order.status === "PENDING" || order.status === "CANCELED");

  const initialOrder: PdvInitialOrder | null = canHydrate
    ? {
        id: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        waiterName: order.waiterName,
        advancePayment: order.advancePayment,
        items: order.items.map((item) => ({
          productId: item.productId,
          title:
            (item.productTitle && item.productTitle.trim()) ||
            item.product.title,
          // Preserva o valor original da comanda ao reabrir.
          price: item.priceAtTime,
          quantity: item.quantity,
        })),
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-800">
          {initialOrder ? "Editar Pedido" : "Novo Pedido"}
        </h1>
        <p className="mt-1 text-stone-500">
          {initialOrder
            ? "Pedido reaberto — ajuste os itens e reenvie a comanda."
            : "Monte a comanda e finalize o pedido do cliente."}
        </p>
      </div>

      <PdvClient products={pdvProducts} initialOrder={initialOrder} />
    </div>
  );
}
