"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { OrderSource, OrderStatus } from "@/lib/orders/constants";
import {
  createMercadoPagoPixPayment,
  createPaymentAccessToken,
} from "@/lib/payments/mercadopago";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";

const checkoutItemSchema = z.object({
  productId: z.string().min(8).max(64),
  quantity: z.number().int().min(1).max(50),
});

const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120),
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
  // Endereço não é mais coletado: por enquanto só retirada no local.
  // Mantemos o campo opcional só por compatibilidade; o servidor ignora e força o valor.
  deliveryAddress: z.string().trim().max(400).optional(),
  deliveryNotes: z.string().trim().max(400).optional(),
  items: z.array(checkoutItemSchema).min(1).max(40),
});

/** Valor fixo gravado em deliveryAddress enquanto a doceria não faz entregas. */
export const PICKUP_FULFILLMENT_LABEL = "Retirada no local";

export type CheckoutPixResult =
  | {
      success: true;
      orderId: string;
      accessToken: string;
      pixCopyPaste: string;
      pixQrCodeBase64: string | null;
      totalAmount: number;
    }
  | { success: false; error: string };

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

/**
 * Cria pedido ONLINE com status AWAITING_PAYMENT e gera PIX dinâmico.
 * Executado 100% no servidor — tokens do gateway nunca chegam ao cliente.
 */
export async function createOnlineOrderWithPix(
  rawInput: unknown
): Promise<CheckoutPixResult> {
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

  // PROTEÇÃO 3 — Rate limit (memória + banco) contra flood de pedidos falsos.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";

  const ipLimit = assertMemoryRateLimit(`checkout:ip:${ip}`, 8, 15 * 60 * 1000);
  if (!ipLimit.ok) {
    return {
      success: false,
      error: `Muitas tentativas. Aguarde ${ipLimit.retryAfterSec}s e tente novamente.`,
    };
  }

  const phoneLimit = assertMemoryRateLimit(
    `checkout:phone:${phone}`,
    5,
    60 * 60 * 1000
  );
  if (!phoneLimit.ok) {
    return {
      success: false,
      error: "Limite de pedidos para este WhatsApp. Tente mais tarde.",
    };
  }

  const recentByPhone = await prisma.order.count({
    where: {
      source: OrderSource.ONLINE,
      customerPhone: phone,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentByPhone >= 5) {
    return {
      success: false,
      error: "Limite de pedidos para este WhatsApp. Tente mais tarde.",
    };
  }

  const merged = new Map<string, number>();
  for (const item of input.items) {
    merged.set(
      item.productId,
      (merged.get(item.productId) ?? 0) + item.quantity
    );
  }
  const productIds = [...merged.keys()];

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      isAvailable: true,
      isDeleted: false,
    },
    select: { id: true, title: true, price: true, costPrice: true },
  });

  if (products.length !== productIds.length) {
    return {
      success: false,
      error: "Um ou mais itens do carrinho não estão mais disponíveis.",
    };
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const orderItems = productIds.map((productId) => {
    const product = productMap.get(productId)!;
    const quantity = merged.get(productId)!;
    return {
      productId: product.id,
      productTitle: product.title,
      quantity,
      // Preço SEMPRE do banco — nunca confiar no valor enviado pelo cliente.
      priceAtTime: product.price,
      costAtTime: product.costPrice,
    };
  });

  const totalAmount =
    Math.round(
      orderItems.reduce(
        (sum, item) => sum + item.priceAtTime * item.quantity,
        0
      ) * 100
    ) / 100;

  if (totalAmount < 0.01) {
    return { success: false, error: "O total do pedido é inválido." };
  }

  const accessToken = createPaymentAccessToken();

  // 1) Persiste pedido AWAITING_PAYMENT (ainda invisível para a cozinha).
  const order = await prisma.order.create({
    data: {
      customerName: input.customerName.trim(),
      customerPhone: phone,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      deliveryAddress: PICKUP_FULFILLMENT_LABEL,
      deliveryNotes: input.deliveryNotes?.trim() || null,
      status: OrderStatus.AWAITING_PAYMENT,
      source: OrderSource.ONLINE,
      totalAmount,
      advancePayment: 0,
      paymentProvider: "mercadopago",
      paymentMethod: "pix",
      paymentAccessToken: accessToken,
      items: { create: orderItems },
    },
    select: { id: true },
  });

  try {
    // 2) Gera PIX no gateway (server-only).
    const pix = await createMercadoPagoPixPayment({
      orderId: order.id,
      amount: totalAmount,
      description: `Pedido Doceria Dona Lu #${order.id.slice(-8).toUpperCase()}`,
      payerEmail: input.customerEmail.trim().toLowerCase(),
      payerName: input.customerName.trim(),
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentId: pix.paymentId,
        pixCopyPaste: pix.copyPaste,
        pixQrCodeBase64: pix.qrCodeBase64,
      },
    });

    // Retorna apenas dados necessários à UX — sem secrets do gateway.
    return {
      success: true,
      orderId: order.id,
      accessToken,
      pixCopyPaste: pix.copyPaste,
      pixQrCodeBase64: pix.qrCodeBase64,
      totalAmount,
    };
  } catch (error) {
    console.error("createOnlineOrderWithPix PIX:", error);

    // Evita pedido órfão “fantasma”: cancela se o gateway falhou.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELED },
    });

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o PIX. Tente novamente.",
    };
  }
}
