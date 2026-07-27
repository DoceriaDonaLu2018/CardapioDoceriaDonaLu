"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { idSchema, productWriteSchema } from "@/lib/validation/safe-input";

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
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  return Number(normalized);
}

function parseProductForm(formData: FormData, withId: boolean) {
  return productWriteSchema.safeParse({
    id: withId ? String(formData.get("id") ?? "") : undefined,
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    price: parsePrice(formData.get("price")),
    costPrice: parsePrice(formData.get("costPrice")),
    isAvailable: formData.get("isAvailable") === "on",
  });
}

export async function createProduct(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  await requireAdmin();

  const parsed = parseProductForm(formData, false);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do produto inválidos.",
    };
  }

  const data = parsed.data;

  try {
    await prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        imageUrl:
          data.imageUrl ||
          "https://placehold.co/800x450/cf2d6c/ffffff?text=Dona+Lu",
        price: data.price,
        costPrice: data.costPrice,
        isAvailable: data.isAvailable,
        categoryId: data.categoryId,
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

  const parsed = parseProductForm(formData, true);
  if (!parsed.success || !parsed.data.id) {
    return {
      error: parsed.success
        ? "Produto inválido."
        : (parsed.error.issues[0]?.message ?? "Dados do produto inválidos."),
    };
  }

  const data = parsed.data;

  try {
    await prisma.product.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description,
        imageUrl:
          data.imageUrl ||
          "https://placehold.co/800x450/cf2d6c/ffffff?text=Dona+Lu",
        price: data.price,
        costPrice: data.costPrice,
        isAvailable: data.isAvailable,
        categoryId: data.categoryId,
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

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Produto inválido." };

  try {
    await prisma.product.update({
      where: { id: parsedId.data },
      data: { isDeleted: true, isAvailable: false },
    });
  } catch {
    return { error: "Não foi possível excluir o produto." };
  }

  revalidateAll();
  return { success: true };
}

export async function toggleProductAvailability(
  id: string,
  isAvailable: boolean
): Promise<ProductActionState> {
  await requireAdmin();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Produto inválido." };

  try {
    await prisma.product.update({
      where: { id: parsedId.data },
      data: { isAvailable: Boolean(isAvailable) },
    });
  } catch {
    return { error: "Não foi possível atualizar a disponibilidade." };
  }

  revalidateAll();
  return { success: true };
}
