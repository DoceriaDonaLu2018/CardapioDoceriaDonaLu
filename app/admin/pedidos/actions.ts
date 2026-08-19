"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { OrderSource } from "@/lib/orders/constants";
import { kitchenEligibleWhere } from "@/lib/orders/kitchen";
import {
  decrementStockOrThrow,
  incrementStock,
  InsufficientStockError,
} from "@/lib/inventory/stock";
import { idSchema, pdvOrderSchema } from "@/lib/validation/safe-input";

export type OrderActionState = {
  error?: string;
  success?: boolean;
  orderId?: string;
};

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
  /** Preço unitário da linha (opcional). Se omitido, usa o preço atual do catálogo. */
  unitPrice?: number;
};

export type CreateOrderInput = {
  customerName: string;
  customerPhone?: string;
  waiterName?: string;
  advancePayment?: number;
  /** cash | credit_card | debit_card | pix — obrigatório no PDV. */
  paymentMethod: "cash" | "credit_card" | "debit_card" | "pix";
  items: CreateOrderItemInput[];
};

export type UpdateOrderInput = CreateOrderInput & {
  orderId: string;
};

/** Mantém apenas os dígitos do telefone (ou null quando vazio). */
function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length > 0 ? digits : null;
}

function mergeItems(items: CreateOrderItemInput[]): CreateOrderItemInput[] {
  const merged = new Map<string, { quantity: number; unitPrice?: number }>();

  for (const item of items) {
    const quantity = Math.max(1, Math.floor(item.quantity));
    const current = merged.get(item.productId);
    if (current) {
      merged.set(item.productId, {
        quantity: current.quantity + quantity,
        unitPrice: current.unitPrice ?? item.unitPrice,
      });
    } else {
      merged.set(item.productId, { quantity, unitPrice: item.unitPrice });
    }
  }

  return [...merged.entries()].map(([productId, value]) => ({
    productId,
    quantity: value.quantity,
    unitPrice: value.unitPrice,
  }));
}

function revalidateOrders() {
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/pedidos/historico");
  revalidatePath("/admin/estoque");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function createOrder(
  input: CreateOrderInput
): Promise<OrderActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  // Validação Zod no servidor — strip HTML + limites (não confiar no PDV client).
  const parsed = pdvOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do pedido inválidos.",
    };
  }

  const name = parsed.data.customerName;
  const waiterName = parsed.data.waiterName;
  const customerPhone = normalizePhone(parsed.data.customerPhone);
  const paymentMethod = parsed.data.paymentMethod;

  const mergedItems = mergeItems(parsed.data.items);
  if (mergedItems.length === 0) {
    return { error: "Adicione pelo menos um item à comanda." };
  }

  const productIds = mergedItems.map((item) => item.productId);

  let products;
  try {
    products = await prisma.product.findMany({
      where: { id: { in: productIds }, isAvailable: true, isDeleted: false },
      select: { id: true, title: true, price: true, costPrice: true },
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
    const unitPrice =
      typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)
        ? item.unitPrice
        : product.price;
    return {
      productId: product.id,
      productTitle: product.title,
      quantity: item.quantity,
      priceAtTime: unitPrice,
      costAtTime: product.costPrice,
    };
  });

  const totalAmount = orderItems.reduce(
    (sum, item) => sum + item.priceAtTime * item.quantity,
    0
  );

  // Sinal: não pode ser negativo nem exceder o total do pedido.
  const rawAdvance = Number(parsed.data.advancePayment ?? 0);
  if (!Number.isFinite(rawAdvance) || rawAdvance < 0) {
    return { error: "O valor do sinal é inválido." };
  }
  // Arredonda para centavos e compara com tolerância para evitar ruído de float.
  const advancePayment = Math.round(rawAdvance * 100) / 100;
  if (advancePayment - totalAmount > 0.001) {
    return { error: "O sinal não pode ser maior que o total do pedido." };
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      for (const item of orderItems) {
        await decrementStockOrThrow(tx, item.productId, item.quantity);
      }

      return tx.order.create({
        data: {
          customerName: name,
          customerPhone,
          waiterName,
          status: "PENDING",
          source: "PDV",
          totalAmount,
          advancePayment,
          paymentMethod,
          releasedToKitchen: true,
          items: { create: orderItems },
        },
      });
    });

    revalidateOrders();

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("createOrder:", error);

    if (error instanceof InsufficientStockError) {
      return { error: "Estoque insuficiente para um ou mais itens." };
    }

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

  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { error: "Pedido inválido." };
  }

  try {
    const result = await prisma.order.updateMany({
      where: {
        id: parsedId.data,
        ...kitchenEligibleWhere,
      },
      data: { status: "COMPLETED", releasedToKitchen: false },
    });

    if (result.count === 0) {
      return {
        error:
          "Só é possível concluir pedidos pagos (online) ou pendentes do balcão.",
      };
    }

    revalidateOrders();

    return { success: true, orderId: parsedId.data };
  } catch (error) {
    console.error("completeOrder:", error);
    return { error: "Não foi possível concluir o pedido." };
  }
}

/** Cancela um pedido ativo (não entra no histórico de vendas). */
export async function cancelOrder(orderId: string): Promise<OrderActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) return { error: "Pedido inválido." };

  try {
    const existing = await prisma.order.findUnique({
      where: { id: parsedId.data },
      select: {
        status: true,
        stockReserved: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
    if (!existing) return { error: "Pedido não encontrado." };
    if (existing.status === "COMPLETED") {
      return { error: "Pedidos concluídos não podem ser cancelados por aqui." };
    }

    // PENDING/PAID baixaram estoque. AWAITING só se stockReserved (legado).
    // REQUIRES_REFUND: cobrado sem baixa — não incrementa.
    const shouldRestore =
      existing.status === "PENDING" ||
      existing.status === "PAID" ||
      (existing.status === "AWAITING_PAYMENT" && existing.stockReserved);

    await prisma.$transaction(async (tx) => {
      // Compare-and-swap: só um cancelamento vence (evita estoque duplicado).
      const claimed = await tx.order.updateMany({
        where: {
          id: parsedId.data,
          status: existing.status,
        },
        data: { status: "CANCELED", stockReserved: false, releasedToKitchen: false },
      });
      if (claimed.count === 0) {
        throw new Error("ORDER_ALREADY_CHANGED");
      }
      if (shouldRestore) {
        for (const item of existing.items) {
          await incrementStock(tx, item.productId, item.quantity);
        }
      }
    });

    revalidateOrders();
    return { success: true, orderId: parsedId.data };
  } catch (error) {
    console.error("cancelOrder:", error);
    if (error instanceof Error && error.message === "ORDER_ALREADY_CHANGED") {
      return { error: "O pedido já foi atualizado. Recarregue a página." };
    }
    return { error: "Não foi possível cancelar o pedido." };
  }
}

/**
 * Reabre um pedido (PENDING ou CANCELED) para edição no PDV.
 * O status volta para PENDING; a UI redireciona para /pedidos/novo?orderId=...
 */
export async function reopenOrder(orderId: string): Promise<OrderActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  if (!orderId) return { error: "Pedido inválido." };

  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) return { error: "Pedido inválido." };

  try {
    const existing = await prisma.order.findUnique({
      where: { id: parsedId.data },
      select: {
        status: true,
        source: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
    if (!existing) return { error: "Pedido não encontrado." };
    if (existing.source === OrderSource.ONLINE) {
      return {
        error:
          "Pedidos online não podem ser reabertos no PDV. Isso colocaria um pedido não pago na cozinha.",
      };
    }
    if (existing.status === "COMPLETED") {
      return { error: "Pedidos concluídos não podem ser reabertos." };
    }
    if (existing.status === "AWAITING_PAYMENT") {
      return {
        error:
          "Pedidos aguardando pagamento online não podem ser reabertos no PDV. Cancele ou aguarde a confirmação.",
      };
    }
    if (existing.status === "REQUIRES_REFUND") {
      return {
        error:
          "Pedido pago sem estoque (REQUIRES_REFUND). Faça o estorno no Mercado Pago e cancele o pedido.",
      };
    }
    if (existing.status === "PAID") {
      return {
        error:
          "Pedidos pagos online não podem ser reabertos no PDV. Cancele se necessário.",
      };
    }

    // CANCELED: estoque já foi devolvido no cancel — re-baixa ao reabrir.
    if (existing.status === "CANCELED") {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: parsedId.data,
            status: "CANCELED",
          },
          data: { status: "PENDING", releasedToKitchen: true },
        });
        if (claimed.count === 0) {
          throw new Error("ORDER_ALREADY_CHANGED");
        }
        for (const item of existing.items) {
          await decrementStockOrThrow(tx, item.productId, item.quantity);
        }
      });
    } else if (existing.status === "PENDING") {
      // Já está no PDV — no-op de status, só confirma que ainda é PENDING.
      const claimed = await prisma.order.updateMany({
        where: { id: parsedId.data, status: "PENDING" },
        data: { status: "PENDING" },
      });
      if (claimed.count === 0) {
        return {
          error: "O pedido mudou de status. Recarregue a página.",
        };
      }
    } else {
      return { error: "Este pedido não pode ser reaberto no PDV." };
    }

    revalidateOrders();
    return { success: true, orderId: parsedId.data };
  } catch (error) {
    console.error("reopenOrder:", error);
    if (error instanceof InsufficientStockError) {
      return {
        error:
          "Não foi possível reabrir: estoque insuficiente para os itens do pedido.",
      };
    }
    if (error instanceof Error && error.message === "ORDER_ALREADY_CHANGED") {
      return { error: "O pedido já foi atualizado. Recarregue a página." };
    }
    return { error: "Não foi possível reabrir o pedido." };
  }
}

/** Atualiza um pedido existente (usado ao reenviar pelo PDV após reabrir). */
export async function updateOrder(
  input: UpdateOrderInput
): Promise<OrderActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = pdvOrderSchema.safeParse(input);
  if (!parsed.success || !parsed.data.orderId) {
    return {
      error: parsed.success
        ? "Pedido inválido."
        : (parsed.error.issues[0]?.message ?? "Dados do pedido inválidos."),
    };
  }

  const orderId = parsed.data.orderId;
  const name = parsed.data.customerName;
  const waiterName = parsed.data.waiterName;
  const customerPhone = normalizePhone(parsed.data.customerPhone);
  const paymentMethod = parsed.data.paymentMethod;
  const mergedItems = mergeItems(parsed.data.items);
  if (mergedItems.length === 0) {
    return { error: "Adicione pelo menos um item à comanda." };
  }

  const productIds = mergedItems.map((item) => item.productId);

  let products;
  try {
    // Na reedição, aceita produtos indisponíveis (já estavam na comanda),
    // mas bloqueia soft-deleted.
    products = await prisma.product.findMany({
      where: { id: { in: productIds }, isDeleted: false },
      select: { id: true, title: true, price: true, costPrice: true },
    });
  } catch (error) {
    console.error("updateOrder find products:", error);
    return { error: "Erro ao consultar produtos. Tente novamente." };
  }

  if (products.length !== productIds.length) {
    return { error: "Um ou mais produtos foram removidos do cardápio." };
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const orderItems = mergedItems.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice =
      typeof item.unitPrice === "number" && Number.isFinite(item.unitPrice)
        ? item.unitPrice
        : product.price;
    return {
      productId: product.id,
      productTitle: product.title,
      quantity: item.quantity,
      // Mantém o preço da linha do carrinho (valor original / ajustado no PDV).
      priceAtTime: unitPrice,
      costAtTime: product.costPrice,
    };
  });

  const totalAmount = orderItems.reduce(
    (sum, item) => sum + item.priceAtTime * item.quantity,
    0
  );

  const rawAdvance = Number(parsed.data.advancePayment ?? 0);
  if (!Number.isFinite(rawAdvance) || rawAdvance < 0) {
    return { error: "O valor do sinal é inválido." };
  }
  const advancePayment = Math.round(rawAdvance * 100) / 100;
  if (advancePayment - totalAmount > 0.001) {
    return { error: "O sinal não pode ser maior que o total do pedido." };
  }

  try {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, source: true },
    });
    if (!existing) return { error: "Pedido não encontrado." };
    if (existing.source !== OrderSource.PDV) {
      return {
        error: "Pedidos online não podem ser editados no PDV.",
      };
    }
    // Só PENDING retém estoque de forma consistente com o delta abaixo
    // (increment dos antigos + decrement dos novos). Editar AWAITING_PAYMENT
    // (estoque não reservado) ou CANCELED (estoque já devolvido) inflaria o
    // estoque e, no online, colocaria um pedido não pago na cozinha.
    // Fluxo correto: usar "Reabrir" (reopenOrder) antes de editar.
    if (existing.status !== "PENDING") {
      return {
        error:
          "Este pedido não pode ser editado diretamente. Use \"Reabrir\" para trazê-lo ao PDV antes de editar.",
      };
    }

    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders
        WHERE id = ${orderId} AND status = 'PENDING'
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new Error("ORDER_ALREADY_CHANGED");
      }

      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { items: { select: { productId: true, quantity: true } } },
      });
      if (!current) {
        throw new Error("ORDER_ALREADY_CHANGED");
      }

      // Devolve estoque dos itens antigos e baixa os novos (delta seguro).
      for (const item of current.items) {
        await incrementStock(tx, item.productId, item.quantity);
      }
      for (const item of orderItems) {
        await decrementStockOrThrow(tx, item.productId, item.quantity);
      }

      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.update({
        where: { id: orderId },
        data: {
          customerName: name,
          customerPhone,
          waiterName,
          status: "PENDING",
          totalAmount,
          advancePayment,
          paymentMethod,
          items: { create: orderItems },
        },
      });
    });

    revalidateOrders();
    return { success: true, orderId };
  } catch (error) {
    console.error("updateOrder:", error);
    if (error instanceof InsufficientStockError) {
      return { error: "Estoque insuficiente para um ou mais itens." };
    }
    if (error instanceof Error && error.message === "ORDER_ALREADY_CHANGED") {
      return { error: "O pedido mudou de status. Recarregue a página." };
    }
    return { error: "Não foi possível atualizar o pedido." };
  }
}
