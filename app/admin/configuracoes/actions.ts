"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  filterSlotsWithinHours,
  storeSettingsSchema,
  type StoreSettingsData,
} from "@/lib/store-settings";

export type SettingsActionState = {
  error?: string;
  success?: boolean;
};

function revalidateSettings() {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/checkout");
  revalidatePath("/");
}

export async function saveStoreSettings(
  raw: unknown
): Promise<SettingsActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = storeSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const open = parsed.data.openTime;
  const close = parsed.data.closeTime;
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  if (oh * 60 + om > ch * 60 + cm) {
    return {
      error: "Horário de abertura deve ser anterior ao de fechamento.",
    };
  }

  const pickupSlots = filterSlotsWithinHours(
    parsed.data.pickupSlots,
    open,
    close
  );

  if (pickupSlots.length === 0) {
    return {
      error:
        "Informe ao menos um horário de retirada dentro do funcionamento.",
    };
  }

  try {
    await prisma.storeSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        openTime: open,
        closeTime: close,
        pickupSlots,
      },
      update: {
        openTime: open,
        closeTime: close,
        pickupSlots,
      },
    });
    revalidateSettings();
    return { success: true };
  } catch (error) {
    console.error("saveStoreSettings:", error);
    return { error: "Não foi possível salvar as configurações." };
  }
}

export type { StoreSettingsData };
