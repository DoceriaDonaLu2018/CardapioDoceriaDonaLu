"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/orders/constants";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";
import {
  reviewPhoneSchema,
  reviewSubmitSchema,
} from "@/lib/validation/safe-input";

type ActionOk<T> = { success: true } & T;
type ActionErr = { success: false; error: string };

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip") || "unknown";
}

/** Verifica se o WhatsApp tem pedido PAID ou COMPLETED. Não devolve PII. */
export async function verifyPurchaseByPhone(
  rawPhone: unknown
): Promise<ActionOk<{ phone: string }> | ActionErr> {
  const parsed = reviewPhoneSchema.safeParse(rawPhone);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "WhatsApp inválido.",
    };
  }

  const phone = normalizePhone(parsed.data);
  if (phone.length < 10) {
    return { success: false, error: "Informe um WhatsApp válido." };
  }

  const ip = await clientIp();
  const limit = assertMemoryRateLimit(`review-verify:${ip}`, 20, 15 * 60_000);
  if (!limit.ok) {
    return {
      success: false,
      error: `Muitas tentativas. Aguarde ${limit.retryAfterSec}s.`,
    };
  }

  const order = await prisma.order.findFirst({
    where: {
      customerPhone: phone,
      status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
    },
    select: { id: true },
  });

  if (!order) {
    return {
      success: false,
      error:
        "Não encontramos um pedido pago com este WhatsApp. Só clientes verificados podem avaliar.",
    };
  }

  return {
    success: true,
    phone,
  };
}

export async function submitVerifiedReview(
  rawInput: unknown
): Promise<ActionOk<{ reviewId: string }> | ActionErr> {
  const parsed = reviewSubmitSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const phone = normalizePhone(parsed.data.customerPhone);
  if (phone.length < 10) {
    return { success: false, error: "Informe um WhatsApp válido." };
  }

  const ip = await clientIp();
  const ipLimit = assertMemoryRateLimit(`review-submit:${ip}`, 10, 60 * 60_000);
  if (!ipLimit.ok) {
    return {
      success: false,
      error: `Limite de envios atingido. Aguarde ${ipLimit.retryAfterSec}s.`,
    };
  }

  const phoneLimit = assertMemoryRateLimit(
    `review-submit-phone:${phone}`,
    3,
    24 * 60 * 60_000
  );
  if (!phoneLimit.ok) {
    return {
      success: false,
      error:
        "Você já enviou várias avaliações hoje. Tente novamente amanhã.",
    };
  }

  const order = await prisma.order.findFirst({
    where: {
      customerPhone: phone,
      status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
      items: { some: { productId: parsed.data.productId } },
    },
    select: { id: true },
  });

  if (!order) {
    return {
      success: false,
      error: "Compra não verificada para este produto neste WhatsApp.",
    };
  }

  const product = await prisma.product.findFirst({
    where: {
      id: parsed.data.productId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (!product) {
    return { success: false, error: "Produto inválido." };
  }

  const alreadyReviewed = await prisma.review.findFirst({
    where: {
      productId: product.id,
      customerPhone: phone,
      isManual: false,
    },
    select: { id: true },
  });

  if (alreadyReviewed) {
    return {
      success: false,
      error: "Você já enviou uma avaliação para este produto.",
    };
  }

  try {
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        customerName: parsed.data.customerName,
        customerPhone: phone,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        isVisible: false,
        isManual: false,
      },
      select: { id: true },
    });

    revalidatePath("/avaliacoes");
    revalidatePath("/admin/avaliacoes");

    return { success: true, reviewId: review.id };
  } catch (error) {
    console.error("submitVerifiedReview:", error);
    return { success: false, error: "Não foi possível enviar a avaliação." };
  }
}
