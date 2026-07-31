"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { normalizeProductImageUrl } from "@/lib/images";
import { adminModifierGroupsSchema } from "@/lib/modifiers/types";
import { idSchema, productWriteSchema } from "@/lib/validation/safe-input";
import { z } from "zod";

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

function parseModifiersFromForm(formData: FormData) {
  const raw = formData.get("modifiersJson");
  if (raw == null || String(raw).trim() === "" || String(raw) === "[]") {
    return {
      ok: true as const,
      groups: [] as z.infer<typeof adminModifierGroupsSchema>,
    };
  }
  try {
    const parsedJson = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsedJson)) {
      return { ok: false as const, error: "Payload de variações inválido." };
    }
    // Ignora rascunhos vazios (admin clicou "Novo grupo" e não preencheu).
    const drafts = parsedJson.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const name = String((item as { name?: unknown }).name ?? "").trim();
      return name.length > 0;
    });
    if (drafts.length === 0) {
      return {
        ok: true as const,
        groups: [] as z.infer<typeof adminModifierGroupsSchema>,
      };
    }
    const parsed = adminModifierGroupsSchema.safeParse(drafts);
    if (!parsed.success) {
      return {
        ok: false as const,
        error:
          parsed.error.issues[0]?.message ?? "Dados de variações inválidos.",
      };
    }
    return { ok: true as const, groups: parsed.data };
  } catch {
    return { ok: false as const, error: "Payload de variações inválido." };
  }
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

  const modifiers = parseModifiersFromForm(formData);
  if (!modifiers.ok) {
    return { error: modifiers.error };
  }

  const data = parsed.data;

  try {
    // Nested write atômico: produto + grupos + opções — tudo ou nada.
    await prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        imageUrl: normalizeProductImageUrl(data.imageUrl),
        price: data.price,
        costPrice: data.costPrice,
        isAvailable: data.isAvailable,
        categoryId: data.categoryId,
        stockQuantity: 1,
        modifierGroups: {
          create: modifiers.groups.map((group, gi) => ({
            name: group.name,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder ?? gi,
            options: {
              create: group.options.map((opt, oi) => ({
                name: opt.name,
                price: opt.price,
                maxQuantityPerOption: opt.maxQuantityPerOption,
                sortOrder: opt.sortOrder ?? oi,
              })),
            },
          })),
        },
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
        imageUrl: normalizeProductImageUrl(data.imageUrl),
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
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Produto inválido." };

  try {
    const result = await prisma.product.updateMany({
      where: { id: parsedId.data, isDeleted: false },
      data: { isAvailable: Boolean(isAvailable) },
    });
    if (result.count === 0) return { error: "Produto não encontrado." };
  } catch {
    return { error: "Não foi possível atualizar a disponibilidade." };
  }

  revalidateAll();
  return { success: true };
}

const idsSchema = z.array(idSchema).min(1).max(200);

export async function bulkSetAvailability(
  ids: string[],
  isAvailable: boolean
): Promise<ProductActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: "Seleção inválida." };

  try {
    await prisma.product.updateMany({
      where: { id: { in: parsed.data }, isDeleted: false },
      data: { isAvailable: Boolean(isAvailable) },
    });
  } catch {
    return { error: "Não foi possível atualizar os produtos selecionados." };
  }

  revalidateAll();
  return { success: true };
}

/** Soft delete em lote — preserva histórico de pedidos (OrderItem Restrict). */
export async function bulkSoftDeleteProducts(
  ids: string[]
): Promise<ProductActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: "Seleção inválida." };

  try {
    await prisma.product.updateMany({
      where: { id: { in: parsed.data }, isDeleted: false },
      data: { isDeleted: true, isAvailable: false },
    });
  } catch {
    return { error: "Não foi possível excluir os produtos selecionados." };
  }

  revalidateAll();
  return { success: true };
}
