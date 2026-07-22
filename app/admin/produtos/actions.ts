"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export type ProductActionState = {
  error?: string;
  success?: boolean;
};

function revalidateAll() {
  revalidatePath("/admin/produtos");
  revalidatePath("/admin");
  revalidatePath("/");
}

function parsePrice(value: FormDataEntryValue | null): number {
  // Aceita "12", "12.5" ou "12,50".
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return Number(normalized);
}

export async function createProduct(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const price = parsePrice(formData.get("price"));
  const costPrice = parsePrice(formData.get("costPrice"));
  const isAvailable = formData.get("isAvailable") === "on";

  if (!title) return { error: "Informe o título do produto." };
  if (!categoryId) return { error: "Selecione uma categoria." };
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Informe um preço válido." };
  }
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return { error: "Informe um custo válido." };
  }

  try {
    await prisma.product.create({
      data: {
        title,
        description,
        imageUrl:
          imageUrl ||
          "https://placehold.co/800x450/cf2d6c/ffffff?text=Dona+Lu",
        price,
        costPrice,
        isAvailable,
        categoryId,
      },
    });
  } catch {
    return { error: "Não foi possível criar o produto." };
  }

  revalidateAll();
  return { success: true };
}

export async function updateProduct(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const price = parsePrice(formData.get("price"));
  const costPrice = parsePrice(formData.get("costPrice"));
  const isAvailable = formData.get("isAvailable") === "on";

  if (!id) return { error: "Produto inválido." };
  if (!title) return { error: "Informe o título do produto." };
  if (!categoryId) return { error: "Selecione uma categoria." };
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Informe um preço válido." };
  }
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return { error: "Informe um custo válido." };
  }

  try {
    await prisma.product.update({
      where: { id },
      data: {
        title,
        description,
        imageUrl:
          imageUrl ||
          "https://placehold.co/800x450/cf2d6c/ffffff?text=Dona+Lu",
        price,
        costPrice,
        isAvailable,
        categoryId,
      },
    });
  } catch {
    return { error: "Não foi possível atualizar o produto." };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteProduct(id: string): Promise<ProductActionState> {
  await requireAdmin();

  if (!id) return { error: "Produto inválido." };

  try {
    // Soft delete: preserva OrderItems e o histórico de vendas.
    await prisma.product.update({
      where: { id },
      data: { isDeleted: true, isAvailable: false },
    });
  } catch {
    return { error: "Não foi possível excluir o produto." };
  }

  revalidateAll();
  return { success: true };
}

/** Alterna rapidamente a disponibilidade a partir da tabela. */
export async function toggleProductAvailability(
  id: string,
  isAvailable: boolean
): Promise<ProductActionState> {
  await requireAdmin();

  try {
    await prisma.product.update({
      where: { id },
      data: { isAvailable },
    });
  } catch {
    return { error: "Não foi possível atualizar a disponibilidade." };
  }

  revalidateAll();
  return { success: true };
}
