"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  idSchema,
  reviewAdminCreateSchema,
} from "@/lib/validation/safe-input";

export type ReviewAdminState = {
  error?: string;
  success?: boolean;
};

function revalidateReviews() {
  revalidatePath("/admin/avaliacoes");
  revalidatePath("/avaliacoes");
  revalidatePath("/");
}

function normalizePhone(value: string | null | undefined): string {
  if (!value) return "admin";
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length >= 10 ? digits : "admin";
}

export async function createManualReview(
  rawInput: unknown
): Promise<ReviewAdminState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = reviewAdminCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  try {
    await prisma.review.create({
      data: {
        productId: parsed.data.productId,
        customerName: parsed.data.customerName,
        customerPhone: normalizePhone(parsed.data.customerPhone),
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        isVisible: parsed.data.isVisible,
        isManual: true,
      },
    });
    revalidateReviews();
    return { success: true };
  } catch (error) {
    console.error("createManualReview:", error);
    return { error: "Não foi possível criar a avaliação." };
  }
}

export async function toggleReviewVisibility(
  reviewId: string
): Promise<ReviewAdminState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(reviewId);
  if (!parsedId.success) return { error: "Avaliação inválida." };

  try {
    const existing = await prisma.review.findUnique({
      where: { id: parsedId.data },
      select: { isVisible: true },
    });
    if (!existing) return { error: "Avaliação não encontrada." };

    const nextVisible = !existing.isVisible;

    await prisma.review.update({
      where: { id: parsedId.data },
      data: {
        isVisible: nextVisible,
        // Ocultar tira da home automaticamente.
        ...(nextVisible ? {} : { isHighlighted: false }),
      },
    });
    revalidateReviews();
    return { success: true };
  } catch (error) {
    console.error("toggleReviewVisibility:", error);
    return { error: "Não foi possível atualizar a visibilidade." };
  }
}

export async function toggleReviewHighlight(
  reviewId: string
): Promise<ReviewAdminState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(reviewId);
  if (!parsedId.success) return { error: "Avaliação inválida." };

  try {
    const existing = await prisma.review.findUnique({
      where: { id: parsedId.data },
      select: { isHighlighted: true, isVisible: true },
    });
    if (!existing) return { error: "Avaliação não encontrada." };

    const nextHighlighted = !existing.isHighlighted;

    // Só permite destacar se estiver visível (ou ao destacar, força visível).
    await prisma.review.update({
      where: { id: parsedId.data },
      data: {
        isHighlighted: nextHighlighted,
        ...(nextHighlighted && !existing.isVisible
          ? { isVisible: true }
          : {}),
      },
    });
    revalidateReviews();
    return { success: true };
  } catch (error) {
    console.error("toggleReviewHighlight:", error);
    return { error: "Não foi possível atualizar o destaque." };
  }
}

export async function deleteReview(
  reviewId: string
): Promise<ReviewAdminState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(reviewId);
  if (!parsedId.success) return { error: "Avaliação inválida." };

  try {
    await prisma.review.delete({ where: { id: parsedId.data } });
    revalidateReviews();
    return { success: true };
  } catch (error) {
    console.error("deleteReview:", error);
    return { error: "Não foi possível excluir a avaliação." };
  }
}
