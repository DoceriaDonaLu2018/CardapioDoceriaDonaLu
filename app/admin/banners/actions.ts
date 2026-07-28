"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  bannerWriteSchema,
  idSchema,
  reorderIdsSchema,
} from "@/lib/validation/safe-input";

export type BannerActionState = {
  error?: string;
  success?: boolean;
};

function revalidateAll() {
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function createBanner(
  _prevState: BannerActionState,
  formData: FormData
): Promise<BannerActionState> {
  await requireAdmin();

  const parsed = bannerWriteSchema.safeParse({
    imageUrl: String(formData.get("imageUrl") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    isActive: formData.get("isActive") === "on",
    order: 0,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados do banner inválidos.",
    };
  }

  if (parsed.data.productId) {
    const product = await prisma.product.findFirst({
      where: {
        id: parsed.data.productId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!product) return { error: "Produto vinculado inválido." };
  }

  try {
    const maxOrder = await prisma.banner.aggregate({ _max: { order: true } });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    await prisma.banner.create({
      data: {
        imageUrl: parsed.data.imageUrl,
        productId: parsed.data.productId,
        isActive: parsed.data.isActive,
        order: nextOrder,
      },
    });
  } catch {
    return { error: "Não foi possível criar o banner." };
  }

  revalidateAll();
  return { success: true };
}

export async function updateBanner(
  _prevState: BannerActionState,
  formData: FormData
): Promise<BannerActionState> {
  await requireAdmin();

  const parsed = bannerWriteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    isActive: formData.get("isActive") === "on",
    order: formData.get("order") ?? 0,
  });

  if (!parsed.success || !parsed.data.id) {
    return {
      error: parsed.success
        ? "Banner inválido."
        : (parsed.error.issues[0]?.message ?? "Dados do banner inválidos."),
    };
  }

  if (parsed.data.productId) {
    const product = await prisma.product.findFirst({
      where: {
        id: parsed.data.productId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!product) return { error: "Produto vinculado inválido." };
  }

  try {
    await prisma.banner.update({
      where: { id: parsed.data.id },
      data: {
        imageUrl: parsed.data.imageUrl,
        productId: parsed.data.productId,
        isActive: parsed.data.isActive,
      },
    });
  } catch {
    return { error: "Não foi possível atualizar o banner." };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteBanner(id: string): Promise<BannerActionState> {
  await requireAdmin();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Banner inválido." };

  try {
    await prisma.banner.delete({ where: { id: parsedId.data } });
  } catch {
    return { error: "Não foi possível excluir o banner." };
  }

  revalidateAll();
  return { success: true };
}

export async function toggleBannerActive(
  id: string,
  isActive: boolean
): Promise<BannerActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Banner inválido." };

  try {
    await prisma.banner.update({
      where: { id: parsedId.data },
      data: { isActive: Boolean(isActive) },
    });
  } catch {
    return { error: "Não foi possível atualizar o banner." };
  }

  revalidateAll();
  return { success: true };
}

export async function reorderBanners(
  orderedIds: string[]
): Promise<BannerActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = reorderIdsSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: "Ordem inválida." };

  try {
    const existing = await prisma.banner.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((b) => b.id));

    if (parsed.data.length !== existingIds.size) {
      return { error: "Lista de banners desatualizada. Recarregue a página." };
    }
    for (const id of parsed.data) {
      if (!existingIds.has(id)) {
        return { error: "Banner inválido na reordenação." };
      }
    }

    await prisma.$transaction(
      parsed.data.map((id, index) =>
        prisma.banner.update({
          where: { id },
          data: { order: index },
        })
      )
    );
  } catch {
    return { error: "Não foi possível salvar a nova ordem." };
  }

  revalidateAll();
  return { success: true };
}
