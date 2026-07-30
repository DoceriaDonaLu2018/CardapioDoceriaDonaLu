"use server";

import { revalidatePath } from "next/cache";
import { DiscountType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  couponWriteSchema,
  giftWriteSchema,
  idSchema,
} from "@/lib/validation/safe-input";

export type PromoActionState = {
  error?: string;
  success?: boolean;
};

function revalidatePromo() {
  revalidatePath("/admin/cupons");
  revalidatePath("/admin/brindes");
  revalidatePath("/checkout");
  revalidatePath("/");
}

function parseMoney(value: FormDataEntryValue | null): number {
  return Number(
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(",", ".")
  );
}

export async function createCoupon(
  _prev: PromoActionState,
  formData: FormData
): Promise<PromoActionState> {
  await requireAdmin();
  const parsed = couponWriteSchema.safeParse({
    code: String(formData.get("code") ?? ""),
    discountType: String(formData.get("discountType") ?? "FIXED"),
    value: parseMoney(formData.get("value")),
    minPurchaseValue: parseMoney(formData.get("minPurchaseValue")),
    isActive: formData.get("isActive") === "on",
    expiresAt: String(formData.get("expiresAt") ?? "") || null,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do cupom inválidos.",
    };
  }
  try {
    await prisma.coupon.create({
      data: {
        code: parsed.data.code,
        discountType: parsed.data.discountType as DiscountType,
        value: parsed.data.value,
        minPurchaseValue: parsed.data.minPurchaseValue,
        isActive: parsed.data.isActive,
        expiresAt: parsed.data.expiresAt,
      },
    });
  } catch {
    return { error: "Não foi possível criar o cupom (código já existe?)." };
  }
  revalidatePromo();
  return { success: true };
}

export async function updateCoupon(
  _prev: PromoActionState,
  formData: FormData
): Promise<PromoActionState> {
  await requireAdmin();
  const parsed = couponWriteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    code: String(formData.get("code") ?? ""),
    discountType: String(formData.get("discountType") ?? "FIXED"),
    value: parseMoney(formData.get("value")),
    minPurchaseValue: parseMoney(formData.get("minPurchaseValue")),
    isActive: formData.get("isActive") === "on",
    expiresAt: String(formData.get("expiresAt") ?? "") || null,
  });
  if (!parsed.success || !parsed.data.id) {
    return {
      error: parsed.success
        ? "Cupom inválido."
        : (parsed.error.issues[0]?.message ?? "Dados inválidos."),
    };
  }
  try {
    await prisma.coupon.update({
      where: { id: parsed.data.id },
      data: {
        code: parsed.data.code,
        discountType: parsed.data.discountType as DiscountType,
        value: parsed.data.value,
        minPurchaseValue: parsed.data.minPurchaseValue,
        isActive: parsed.data.isActive,
        expiresAt: parsed.data.expiresAt,
      },
    });
  } catch {
    return { error: "Não foi possível atualizar o cupom." };
  }
  revalidatePromo();
  return { success: true };
}

export async function deleteCoupon(id: string): Promise<PromoActionState> {
  await requireAdmin();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Cupom inválido." };
  try {
    await prisma.coupon.delete({ where: { id: parsedId.data } });
  } catch {
    return { error: "Não foi possível excluir o cupom." };
  }
  revalidatePromo();
  return { success: true };
}

export async function createGift(
  _prev: PromoActionState,
  formData: FormData
): Promise<PromoActionState> {
  await requireAdmin();
  const parsed = giftWriteSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    minPurchaseValue: parseMoney(formData.get("minPurchaseValue")),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do brinde inválidos.",
    };
  }
  try {
    await prisma.gift.create({
      data: {
        name: parsed.data.name,
        minPurchaseValue: parsed.data.minPurchaseValue,
        isActive: parsed.data.isActive,
      },
    });
  } catch {
    return { error: "Não foi possível criar o brinde." };
  }
  revalidatePromo();
  return { success: true };
}

export async function updateGift(
  _prev: PromoActionState,
  formData: FormData
): Promise<PromoActionState> {
  await requireAdmin();
  const parsed = giftWriteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    minPurchaseValue: parseMoney(formData.get("minPurchaseValue")),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success || !parsed.data.id) {
    return {
      error: parsed.success
        ? "Brinde inválido."
        : (parsed.error.issues[0]?.message ?? "Dados inválidos."),
    };
  }
  try {
    await prisma.gift.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        minPurchaseValue: parsed.data.minPurchaseValue,
        isActive: parsed.data.isActive,
      },
    });
  } catch {
    return { error: "Não foi possível atualizar o brinde." };
  }
  revalidatePromo();
  return { success: true };
}

export async function deleteGift(id: string): Promise<PromoActionState> {
  await requireAdmin();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Brinde inválido." };
  try {
    await prisma.gift.delete({ where: { id: parsedId.data } });
  } catch {
    return { error: "Não foi possível excluir o brinde." };
  }
  revalidatePromo();
  return { success: true };
}
