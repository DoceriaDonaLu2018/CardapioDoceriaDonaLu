"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  OrderSource,
  OrderStatus,
  PICKUP_FULFILLMENT_LABEL,
} from "@/lib/orders/constants";
import {
  createMercadoPagoCardPayment,
  createMercadoPagoPixPayment,
  createPaymentAccessToken,
  mapMercadoPagoError,
} from "@/lib/payments/mercadopago";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";

const checkoutItemSchema = z.object({
  productId: z.string().min(8).max(64),
  quantity: z.number().int().min(1).max(50),
});

const checkoutSchema = z.object({
  customerName: z.string().trim().min(2, "Informe seu nome.").max(120),
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
  deliveryAddress: z.string().trim().max(400).optional(),
  deliveryNotes: z.string().trim().max(400).optional(),
  items: z.array(checkoutItemSchema).min(1).max(40),
});

const orderAuthSchema = z.object({
  orderId: z.string().min(8).max(64),
  accessToken: z.string().min(32).max(128),
});

const cardPaySchema = orderAuthSchema.extend({
  token: z.string().min(10).max(256),
  paymentMethodId: z.string().min(1).max(64),
  installments: z.number().int().min(1).max(24),
  issuerId: z.union([z.string(), z.number()]).optional().nullable(),
  identificationType: z.string().min(2).max(20),
  identificationNumber: z.string().min(5).max(20),
});

type ActionOk<T> = { success: true } & T;
type ActionErr = { success: false; error: string };

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

async function assertRateLimits(phone: string): Promise<ActionErr | null> {
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

  return null;
}

/**
 * Cria o pedido ONLINE (AWAITING_PAYMENT) SEM chamar o gateway ainda.
 * O cliente escolhe PIX ou cartão na tela seguinte.
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

  const rateError = await assertRateLimits(phone);
  if (rateError) return rateError;

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
      paymentAccessToken: accessToken,
      items: { create: orderItems },
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

/** Garante PIX gerado (idempotente se já existir). */
export async function ensurePixForOrder(
  rawInput: unknown
): Promise<
  | ActionOk<{
      pixCopyPaste: string;
      pixQrCodeBase64: string | null;
      totalAmount: number;
    }>
  | ActionErr
> {
  const parsed = orderAuthSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Pedido inválido." };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: parsed.data.orderId,
      paymentAccessToken: parsed.data.accessToken,
      source: OrderSource.ONLINE,
      status: OrderStatus.AWAITING_PAYMENT,
    },
    select: {
      id: true,
      totalAmount: true,
      customerName: true,
      customerEmail: true,
      paymentId: true,
      pixCopyPaste: true,
      pixQrCodeBase64: true,
    },
  });

  if (!order) {
    return { success: false, error: "Pedido não encontrado ou já pago." };
  }

  if (order.pixCopyPaste) {
    return {
      success: true,
      pixCopyPaste: order.pixCopyPaste,
      pixQrCodeBase64: order.pixQrCodeBase64,
      totalAmount: order.totalAmount,
    };
  }

  try {
    const pix = await createMercadoPagoPixPayment({
      orderId: order.id,
      amount: order.totalAmount,
      description: `Pedido Doceria Dona Lu #${order.id.slice(-8).toUpperCase()}`,
      payerEmail: order.customerEmail || "cliente@doceriadonalu.com",
      payerName: order.customerName,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentId: pix.paymentId,
        paymentMethod: "pix",
        pixCopyPaste: pix.copyPaste,
        pixQrCodeBase64: pix.qrCodeBase64,
      },
    });

    return {
      success: true,
      pixCopyPaste: pix.copyPaste,
      pixQrCodeBase64: pix.qrCodeBase64,
      totalAmount: order.totalAmount,
    };
  } catch (error) {
    console.error("ensurePixForOrder:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? mapMercadoPagoError(error.message)
          : "Não foi possível gerar o PIX.",
    };
  }
}

/**
 * Paga com cartão usando token do Card Payment Brick (PCI-safe).
 * Se o MP aprovar na hora, promove o pedido para PAID imediatamente.
 */
export async function payOrderWithCard(
  rawInput: unknown
): Promise<
  ActionOk<{ paymentId: string; status: string; paid: boolean }> | ActionErr
> {
  const parsed = cardPaySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados do cartão inválidos.",
    };
  }

  const input = parsed.data;

  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      paymentAccessToken: input.accessToken,
      source: OrderSource.ONLINE,
      status: OrderStatus.AWAITING_PAYMENT,
    },
    select: {
      id: true,
      totalAmount: true,
      customerEmail: true,
      customerName: true,
    },
  });

  if (!order) {
    return { success: false, error: "Pedido não encontrado ou já pago." };
  }

  try {
    const payment = await createMercadoPagoCardPayment({
      orderId: order.id,
      amount: order.totalAmount,
      description: `Pedido Doceria Dona Lu #${order.id.slice(-8).toUpperCase()}`,
      token: input.token,
      paymentMethodId: input.paymentMethodId,
      installments: input.installments,
      issuerId: input.issuerId,
      payerEmail: order.customerEmail || "cliente@doceriadonalu.com",
      identificationType: input.identificationType,
      identificationNumber: input.identificationNumber,
    });

    const approved = payment.status === "approved";

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentId: payment.paymentId,
        paymentMethod: input.paymentMethodId,
        ...(approved
          ? { status: OrderStatus.PAID, paidAt: new Date() }
          : {}),
      },
    });

    if (
      !approved &&
      payment.status !== "pending" &&
      payment.status !== "in_process"
    ) {
      return {
        success: false,
        error:
          payment.statusDetail === "cc_rejected_insufficient_amount"
            ? "Cartão sem limite suficiente."
            : payment.statusDetail === "cc_rejected_bad_filled_security_code"
              ? "Código de segurança (CVV) inválido."
              : payment.statusDetail === "cc_rejected_bad_filled_date"
                ? "Data de validade inválida."
                : `Pagamento não aprovado (${payment.status}). Tente outro cartão ou PIX.`,
      };
    }

    return {
      success: true,
      paymentId: payment.paymentId,
      status: payment.status,
      paid: approved,
    };
  } catch (error) {
    console.error("payOrderWithCard:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? mapMercadoPagoError(error.message)
          : "Não foi possível pagar com cartão.",
    };
  }
}
