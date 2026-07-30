"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  OrderSource,
  OrderStatus,
  PICKUP_FULFILLMENT_LABEL,
} from "@/lib/orders/constants";
import {
  createCheckoutProPreference,
  createPaymentAccessToken,
  mapMercadoPagoError,
} from "@/lib/payments/mercadopago";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";
import { getSelectablePickupSlots, getStoreSettings } from "@/lib/store-settings";
import { checkStoreStatus } from "@/lib/store-status";
import { quoteCoupon, quoteGifts } from "@/lib/pricing/coupons-gifts";
import {
  cartModifiersInputSchema,
  validateAndBuildModifierSnapshot,
  type ModifierGroupDef,
  type ModifierSelectionSnapshot,
} from "@/lib/modifiers/types";
import { stripHtml } from "@/lib/validation/safe-input";

const checkoutItemSchema = z.object({
  productId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  quantity: z.number().int().min(1).max(50),
  /** Payload leve: só IDs + qty — preços/nomes vêm do banco. */
  modifiers: cartModifiersInputSchema.optional().default([]),
});

const checkoutSchema = z
  .object({
    customerName: z
      .string()
      .transform(stripHtml)
      .pipe(z.string().min(2, "Informe seu nome.").max(120)),
    customerPhone: z
      .string()
      .trim()
      .min(10, "Informe um WhatsApp válido.")
      .max(20),
    customerEmail: z
      .string()
      .trim()
      .min(5, "Informe um e-mail válido.")
      .max(160)
      .refine(
        (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "Informe um e-mail válido."
      ),
    deliveryNotes: z
      .string()
      .optional()
      .transform((v) => (v == null ? undefined : stripHtml(v).slice(0, 400))),
    /** pickup = retirada hoje | scheduled = encomenda com data */
    fulfillmentMode: z.enum(["pickup", "scheduled"]).default("pickup"),
    pickupTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Selecione um horário válido."),
    deliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da encomenda.")
      .optional()
      .nullable(),
    couponCode: z
      .string()
      .optional()
      .nullable()
      .transform((v) => {
        if (v == null) return null;
        const cleaned = stripHtml(v).toUpperCase().slice(0, 40);
        return cleaned.length > 0 ? cleaned : null;
      }),
    items: z.array(checkoutItemSchema).min(1).max(40),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillmentMode === "scheduled" && !data.deliveryDate) {
      ctx.addIssue({
        code: "custom",
        message: "Informe a data da encomenda.",
        path: ["deliveryDate"],
      });
    }
  });

const orderAuthSchema = z.object({
  orderId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  accessToken: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[a-f0-9]+$/i),
});

const checkoutProPaySchema = orderAuthSchema.extend({
  paymentChoice: z.enum(["pix", "card"]),
});

type ActionOk<T> = { success: true } & T;
type ActionErr = { success: false; error: string };

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

/**
 * Limite por WhatsApp: 5 pedidos finalizados por hora (PAID ou CANCELED).
 * Pedidos só em AWAITING_PAYMENT (ainda escolhendo/pagando) NÃO contam.
 */
async function assertRateLimits(phone: string): Promise<ActionErr | null> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";

  const ipLimit = assertMemoryRateLimit(`checkout:ip:${ip}`, 40, 15 * 60 * 1000);
  if (!ipLimit.ok) {
    return {
      success: false,
      error: `Muitas tentativas. Aguarde ${ipLimit.retryAfterSec}s e tente novamente.`,
    };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentFinalized = await prisma.order.count({
    where: {
      source: OrderSource.ONLINE,
      customerPhone: phone,
      createdAt: { gte: oneHourAgo },
      status: {
        in: [OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.CANCELED],
      },
    },
  });

  if (recentFinalized >= 5) {
    return {
      success: false,
      error:
        "Limite de 5 pedidos por hora neste WhatsApp. Aguarde a próxima hora para pedir de novo.",
    };
  }

  return null;
}

/**
 * Cria o pedido ONLINE (AWAITING_PAYMENT) SEM chamar o gateway ainda.
 * O pagamento acontece no Checkout Pro do Mercado Pago (redirect).
 *
 * Estoque: apenas VALIDA disponibilidade aqui. A baixa definitiva ocorre
 * no webhook/sync quando o pagamento estiver `approved` (evita retenção
 * permanente se o cliente abandonar o checkout).
 */
export async function createOnlineOrder(
  rawInput: unknown
): Promise<
  ActionOk<{ orderId: string; accessToken: string; totalAmount: number }> | ActionErr
> {
  const parsed = checkoutSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const input = parsed.data;
  const phone = normalizePhone(input.customerPhone);
  if (phone.length < 10) {
    return { success: false, error: "Informe um WhatsApp válido." };
  }

  const allowedSlots = await getSelectablePickupSlots();
  if (allowedSlots.length === 0) {
    return {
      success: false,
      error:
        "Nenhum horário de retirada disponível no momento. Tente mais tarde.",
    };
  }
  if (!allowedSlots.includes(input.pickupTime)) {
    return {
      success: false,
      error: "Horário de retirada inválido. Escolha um dos horários disponíveis.",
    };
  }

  const isScheduled = input.fulfillmentMode === "scheduled";
  const deliveryDate = isScheduled ? input.deliveryDate ?? null : null;

  // Revalidação de status da loja no instante do submit (fuso Brasília).
  const storeStatus = await checkStoreStatus({
    fulfillmentMode: input.fulfillmentMode,
    deliveryDate,
  });
  if (isScheduled) {
    if (!storeStatus.canCheckoutScheduled) {
      return { success: false, error: storeStatus.message };
    }
  } else if (!storeStatus.canCheckoutPickup) {
    return { success: false, error: storeStatus.message };
  }

  const rateError = await assertRateLimits(phone);
  if (rateError) return rateError;

  // Estoque: soma por produto (linhas com mods diferentes contam juntas).
  const qtyByProduct = new Map<string, number>();
  for (const item of input.items) {
    qtyByProduct.set(
      item.productId,
      (qtyByProduct.get(item.productId) ?? 0) + item.quantity
    );
  }
  const productIds = [...qtyByProduct.keys()];

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      isAvailable: true,
      isDeleted: false,
    },
    select: {
      id: true,
      title: true,
      price: true,
      costPrice: true,
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
  });

  if (products.length !== productIds.length) {
    return {
      success: false,
      error: "Um ou mais itens do carrinho não estão mais disponíveis.",
    };
  }

  for (const product of products) {
    const qty = qtyByProduct.get(product.id) ?? 0;
    if (product.stockQuantity < qty) {
      return {
        success: false,
        error:
          product.stockQuantity <= 0
            ? `"${product.title}" está esgotado.`
            : `"${product.title}" tem apenas ${product.stockQuantity} unidade(s) em estoque.`,
      };
    }
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const orderItems: {
    productId: string;
    productTitle: string;
    quantity: number;
    priceAtTime: number;
    costAtTime: number;
    modifiers: ModifierSelectionSnapshot[] | null;
  }[] = [];

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return {
        success: false,
        error: "Um ou mais itens do carrinho não estão mais disponíveis.",
      };
    }

    const groups: ModifierGroupDef[] = product.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        price: o.price,
        maxQuantityPerOption: o.maxQuantityPerOption,
      })),
    }));

    const validated = validateAndBuildModifierSnapshot(groups, item.modifiers);
    if (!validated.ok) {
      return {
        success: false,
        error: `"${product.title}": ${validated.error}`,
      };
    }

    const priceAtTime =
      Math.round((product.price + validated.extras) * 100) / 100;

    orderItems.push({
      productId: product.id,
      productTitle: product.title,
      quantity: item.quantity,
      priceAtTime,
      costAtTime: product.costPrice,
      modifiers: validated.snapshot.length > 0 ? validated.snapshot : null,
    });
  }

  const subtotal =
    Math.round(
      orderItems.reduce(
        (sum, item) => sum + item.priceAtTime * item.quantity,
        0
      ) * 100
    ) / 100;

  if (subtotal < 0.01) {
    return { success: false, error: "O total do pedido é inválido." };
  }

  const settings = await getStoreSettings();
  if (settings.minOrderValue > 0 && subtotal < settings.minOrderValue) {
    return {
      success: false,
      error: `Pedido mínimo de R$ ${settings.minOrderValue
        .toFixed(2)
        .replace(".", ",")}.`,
    };
  }

  let discountAmount = 0;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const couponQuote = await quoteCoupon(input.couponCode, subtotal);
    if (!couponQuote.ok) {
      return { success: false, error: couponQuote.error };
    }
    discountAmount = couponQuote.discountAmount;
    couponCode = couponQuote.coupon.code;
  }

  const giftQuote = await quoteGifts(subtotal);
  const giftName = giftQuote.selected?.name ?? null;

  const totalAmount =
    Math.round(Math.max(0, subtotal - discountAmount) * 100) / 100;

  if (totalAmount < 0.01) {
    return { success: false, error: "O total do pedido é inválido." };
  }

  const accessToken = createPaymentAccessToken();

  // Sem decrement: só cria o pedido. Race final é tratada no webhook (atômico).
  const order = await prisma.order.create({
    data: {
      customerName: input.customerName.trim(),
      customerPhone: phone,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      deliveryAddress: PICKUP_FULFILLMENT_LABEL,
      deliveryNotes: input.deliveryNotes?.trim() || null,
      pickupTime: input.pickupTime,
      deliveryDate,
      status: OrderStatus.AWAITING_PAYMENT,
      source: OrderSource.ONLINE,
      totalAmount,
      discountAmount,
      couponCode,
      giftName,
      advancePayment: 0,
      paymentProvider: "mercadopago",
      paymentAccessToken: accessToken,
      stockReserved: false,
      items: {
        create: orderItems.map((item) => ({
          productId: item.productId,
          productTitle: item.productTitle,
          quantity: item.quantity,
          priceAtTime: item.priceAtTime,
          costAtTime: item.costAtTime,
          modifiers:
            item.modifiers === null
              ? Prisma.JsonNull
              : (item.modifiers as Prisma.InputJsonValue),
        })),
      },
    },
    select: { id: true },
  });

  return {
    success: true,
    orderId: order.id,
    accessToken,
    totalAmount,
  };
}

/** Preview de cupom no checkout (subtotal deve vir recalculável; aqui só valida código + mínimo). */
export async function previewCoupon(
  raw: unknown
): Promise<
  | { success: true; discountAmount: number; code: string }
  | { success: false; error: string }
> {
  const schema = z.object({
    code: z.string().min(1).max(40),
    subtotal: z.number().finite().min(0).max(1_000_000),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Cupom inválido." };
  }
  const quote = await quoteCoupon(parsed.data.code, parsed.data.subtotal);
  if (!quote.ok) return { success: false, error: quote.error };
  return {
    success: true,
    discountAmount: quote.discountAmount,
    code: quote.coupon.code,
  };
}

/**
 * Cria a preferência Checkout Pro conforme a escolha (PIX ou cartão)
 * e devolve preferenceId + URL para o Wallet Brick / redirect.
 */
export async function startCheckoutProPayment(
  rawInput: unknown
): Promise<
  ActionOk<{ preferenceId: string; checkoutUrl: string }> | ActionErr
> {
  const parsed = checkoutProPaySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Escolha PIX ou cartão para continuar." };
  }

  const { paymentChoice } = parsed.data;

  const order = await prisma.order.findFirst({
    where: {
      id: parsed.data.orderId,
      paymentAccessToken: parsed.data.accessToken,
      source: OrderSource.ONLINE,
      status: OrderStatus.AWAITING_PAYMENT,
    },
    select: {
      id: true,
      customerName: true,
      customerEmail: true,
      paymentAccessToken: true,
      totalAmount: true,
      discountAmount: true,
      items: {
        select: {
          productId: true,
          productTitle: true,
          quantity: true,
          priceAtTime: true,
        },
      },
    },
  });

  if (!order || !order.paymentAccessToken) {
    return { success: false, error: "Pedido não encontrado ou já pago." };
  }

  if (order.items.length === 0) {
    return { success: false, error: "Pedido sem itens." };
  }

  const subtotal = order.items.reduce(
    (sum, item) => sum + item.priceAtTime * item.quantity,
    0
  );
  // Distribui desconto proporcional nos itens para o total do MP bater com o pedido.
  const targetTotal = order.totalAmount;
  const factor =
    subtotal > 0 && order.discountAmount > 0 ? targetTotal / subtotal : 1;
  let running = 0;
  const mpItems = order.items.map((item, index) => {
    const isLast = index === order.items.length - 1;
    let unitPrice =
      Math.round(item.priceAtTime * factor * 100) / 100;
    if (isLast && order.items.length > 0) {
      const previous = running;
      const lineTotal = Math.round((targetTotal - previous) * 100) / 100;
      unitPrice =
        Math.round((lineTotal / item.quantity) * 100) / 100;
    }
    running += unitPrice * item.quantity;
    return {
      id: item.productId,
      title: item.productTitle,
      quantity: item.quantity,
      unitPrice: Math.max(0.01, unitPrice),
    };
  });

  try {
    const preference = await createCheckoutProPreference({
      orderId: order.id,
      accessToken: order.paymentAccessToken,
      payerEmail: order.customerEmail || "cliente@doceriadonalu.com",
      payerName: order.customerName,
      paymentChoice,
      items: mpItems,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: paymentChoice === "pix" ? "pix" : "card",
      },
    });

    return {
      success: true,
      preferenceId: preference.preferenceId,
      checkoutUrl: preference.checkoutUrl,
    };
  } catch (error) {
    console.error("startCheckoutProPayment:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? mapMercadoPagoError(error.message)
          : "Não foi possível abrir o pagamento no Mercado Pago.",
    };
  }
}
