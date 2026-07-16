"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export type OrderActionState = {
  error?: string;
  success?: boolean;
  orderId?: string;
};

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
};

export type CreateOrderInput = {
  customerName: string;
  customerPhone?: string;
  waiterName?: string;
  advancePayment?: number;
  items: CreateOrderItemInput[];
};

/** Mantém apenas os dígitos do telefone (ou null quando vazio). */
function normalizePhone(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function mergeItems(items: CreateOrderItemInput[]): CreateOrderItemInput[] {
  const merged = new Map<string, number>();

  for (const item of items) {
    const quantity = Math.max(1, Math.floor(item.quantity));
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + quantity);
  }

  return [...merged.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function revalidateOrders() {
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/pedidos/historico");
  revalidatePath("/admin");
}

export async function createOrder(
  input: CreateOrderInput
): Promise<OrderActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const name = input.customerName.trim();
  if (!name) {
    return { error: "Informe o nome do cliente." };
  }

  const waiterName = input.waiterName?.trim() || null;
  const customerPhone = normalizePhone(input.customerPhone);

  const mergedItems = mergeItems(input.items);
  if (mergedItems.length === 0) {
    return { error: "Adicione pelo menos um item à comanda." };
  }

  const productIds = mergedItems.map((item) => item.productId);

  let products;
  try {
    products = await prisma.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
    });
  } catch (error) {
    console.error("createOrder find products:", error);
    return { error: "Erro ao consultar produtos. Tente novamente." };
  }

  if (products.length !== productIds.length) {
    return { error: "Um ou mais produtos não estão disponíveis." };
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  const orderItems = mergedItems.map((item) => {
    const product = productMap.get(item.productId)!;
    return {
      productId: product.id,
      quantity: item.quantity,
      priceAtTime: product.price,
      costAtTime: product.costPrice,
    };
  });

  const totalAmount = orderItems.reduce(
    (sum, item) => sum + item.priceAtTime * item.quantity,
    0
  );

  // Sinal: não pode ser negativo nem exceder o total do pedido.
  const rawAdvance = Number(input.advancePayment ?? 0);
  if (!Number.isFinite(rawAdvance) || rawAdvance < 0) {
    return { error: "O valor do sinal é inválido." };
  }
  // Arredonda para centavos e compara com tolerância para evitar ruído de float.
  const advancePayment = Math.round(rawAdvance * 100) / 100;
  if (advancePayment - totalAmount > 0.001) {
    return { error: "O sinal não pode ser maior que o total do pedido." };
  }

  try {
    const order = await prisma.order.create({
      data: {
        customerName: name,
        customerPhone,
        waiterName,
        status: "PENDING",
        totalAmount,
        advancePayment,
        items: { create: orderItems },
      },
    });

    revalidateOrders();

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("createOrder:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return {
        error:
          "Tabelas de pedidos não encontradas no banco. Aguarde o deploy concluir e tente novamente.",
      };
    }

    return { error: "Não foi possível enviar o pedido." };
  }
}

/** Marca o pedido como impresso/concluído e o move para o histórico. */
export async function completeOrder(orderId: string): Promise<OrderActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (!orderId) {
    return { error: "Pedido inválido." };
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "COMPLETED" },
    });

    revalidateOrders();

    return { success: true, orderId };
  } catch (error) {
    console.error("completeOrder:", error);
    return { error: "Não foi possível concluir o pedido." };
  }
}
