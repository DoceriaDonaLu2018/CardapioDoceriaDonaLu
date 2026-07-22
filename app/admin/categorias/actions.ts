"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { requireAdmin } from "@/lib/auth-guard";

export type CategoryActionState = {
  error?: string;
  success?: boolean;
};

function revalidateAll() {
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/produtos");
  revalidatePath("/");
}

export async function createCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const orderRaw = formData.get("order");
  const order = orderRaw ? Number(orderRaw) : 0;

  if (!name) {
    return { error: "Informe o nome da categoria." };
  }

  try {
    await prisma.category.create({
      data: {
        name,
        slug: slugify(name),
        order: Number.isFinite(order) ? order : 0,
      },
    });
  } catch {
    return { error: "Já existe uma categoria com esse nome/slug." };
  }

  revalidateAll();
  return { success: true };
}

export async function updateCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const orderRaw = formData.get("order");
  const order = orderRaw ? Number(orderRaw) : 0;

  if (!id) return { error: "Categoria inválida." };
  if (!name) return { error: "Informe o nome da categoria." };

  try {
    await prisma.category.update({
      where: { id },
      data: {
        name,
        slug: slugify(name),
        order: Number.isFinite(order) ? order : 0,
      },
    });
  } catch {
    return { error: "Não foi possível atualizar a categoria." };
  }

  revalidateAll();
  return { success: true };
}

export async function deleteCategory(id: string): Promise<CategoryActionState> {
  await requireAdmin();

  if (!id) return { error: "Categoria inválida." };

  try {
    // onDelete: SetNull — produtos ficam sem categoria e não bloqueiam a exclusão.
    await prisma.category.delete({ where: { id } });
  } catch {
    return { error: "Não foi possível excluir a categoria." };
  }

  revalidateAll();
  return { success: true };
}
