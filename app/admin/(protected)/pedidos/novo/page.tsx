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

  const [products, order, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isAvailable: true, isDeleted: false },
      orderBy: [{ category: { order: "asc" } }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        price: true,
        imageUrl: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    }),
    orderId
      ? prisma.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            customerName: true,
            customerPhone: true,
            waiterName: true,
            advancePayment: true,
            paymentMethod: true,
            items: {
              select: {
                productId: true,
                productTitle: true,
                priceAtTime: true,
                quantity: true,
                product: { select: { title: true, price: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
    prisma.category.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const pdvProducts = products.map((product) => ({
    id: product.id,
    title: product.title,
    price: product.price,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
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
        paymentMethod: order.paymentMethod,
        items: order.items.map((item) => ({
          productId: item.productId,
          title:
            (item.productTitle && item.productTitle.trim()) ||
            item.product.title,
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

      <PdvClient
        products={pdvProducts}
        categories={categories}
        initialOrder={initialOrder}
      />
    </div>
  );
}
