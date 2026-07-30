import { prisma } from "@/lib/prisma";
import type { Coupon, Gift } from "@prisma/client";
import { DiscountType } from "@prisma/client";

export type CouponQuote =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; error: string };

export type GiftQuote = {
  gifts: Gift[];
  /** Melhor brinde elegível (maior minPurchaseValue <= subtotal). */
  selected: Gift | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeCouponDiscount(
  coupon: Pick<Coupon, "discountType" | "value">,
  subtotal: number
): number {
  if (subtotal <= 0) return 0;
  if (coupon.discountType === DiscountType.PERCENTAGE) {
    const raw = subtotal * (coupon.value / 100);
    return roundMoney(Math.min(subtotal, Math.max(0, raw)));
  }
  return roundMoney(Math.min(subtotal, Math.max(0, coupon.value)));
}

/**
 * Valida cupom contra o banco (não confia no front).
 * Código é normalizado para UPPERCASE.
 */
export async function quoteCoupon(
  rawCode: string | null | undefined,
  subtotal: number,
  now: Date = new Date()
): Promise<CouponQuote> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "Informe um cupom." };
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code },
  });

  if (!coupon || !coupon.isActive) {
    return { ok: false, error: "Cupom inválido ou inativo." };
  }

  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
    return { ok: false, error: "Este cupom expirou." };
  }

  if (subtotal < coupon.minPurchaseValue) {
    return {
      ok: false,
      error: `Cupom válido a partir de R$ ${coupon.minPurchaseValue
        .toFixed(2)
        .replace(".", ",")}.`,
    };
  }

  return {
    ok: true,
    coupon,
    discountAmount: computeCouponDiscount(coupon, subtotal),
  };
}

/** Brindes ativos elegíveis pelo subtotal (preços do servidor). */
export async function quoteGifts(subtotal: number): Promise<GiftQuote> {
  const gifts = await prisma.gift.findMany({
    where: { isActive: true },
    orderBy: { minPurchaseValue: "asc" },
  });

  const eligible = gifts.filter((g) => subtotal >= g.minPurchaseValue);
  const selected =
    eligible.length > 0
      ? eligible.reduce((best, g) =>
          g.minPurchaseValue >= best.minPurchaseValue ? g : best
        )
      : null;

  return { gifts, selected };
}
