"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { requireAdmin } from "@/lib/auth-guard";
import { categoryWriteSchema, idSchema } from "@/lib/validation/safe-input";

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

  const parsed = categoryWriteSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    order: formData.get("order") ?? 0,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  try {
    await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.name),
        order: parsed.data.order,
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

  const parsed = categoryWriteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    order: formData.get("order") ?? 0,
  });

  if (!parsed.success || !parsed.data.id) {
    return {
      error: parsed.success
        ? "Categoria inválida."
        : (parsed.error.issues[0]?.message ?? "Dados inválidos."),
    };
  }

  try {
    await prisma.category.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.name),
        order: parsed.data.order,
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

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "Categoria inválida." };

  try {
    await prisma.category.delete({ where: { id: parsedId.data } });
  } catch {
    return { error: "Não foi possível excluir a categoria." };
  }

  revalidateAll();
  return { success: true };
}
