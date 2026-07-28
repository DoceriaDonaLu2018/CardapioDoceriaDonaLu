"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { requireAdmin } from "@/lib/auth-guard";
import { categoryWriteSchema, idSchema, reorderIdsSchema } from "@/lib/validation/safe-input";

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
    order: 0,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  try {
    const maxOrder = await prisma.category.aggregate({
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.name),
        order: nextOrder,
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
        // Ordem só muda via drag-and-drop (reorderCategories).
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

/**
 * Atualiza a ordem de todas as categorias em uma única transação.
 * Recebe a lista completa de IDs na ordem desejada (índice = order).
 */
export async function reorderCategories(
  orderedIds: string[]
): Promise<CategoryActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = reorderIdsSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: "Ordem inválida." };

  try {
    const existing = await prisma.category.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((c) => c.id));

    if (parsed.data.length !== existingIds.size) {
      return { error: "Lista de categorias desatualizada. Recarregue a página." };
    }
    for (const id of parsed.data) {
      if (!existingIds.has(id)) {
        return { error: "Categoria inválida na reordenação." };
      }
    }

    await prisma.$transaction(
      parsed.data.map((id, index) =>
        prisma.category.update({
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
