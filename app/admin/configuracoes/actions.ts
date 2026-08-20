"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  extractBlobPathnameFromFileUrl,
  sanitizeNotificationSoundSrc,
} from "@/lib/audio/mp3";
import { deleteBlobQuietly } from "@/lib/blob-delete";
import {
  filterSlotsWithinHours,
  getStoreSettings,
  storeSettingsSchema,
  toOperatingHoursJson,
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

function revalidateSoundSettings() {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/pedidos");
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

  const allowed = [...new Set(parsed.data.allowedPreOrderDays)].sort(
    (a, b) => a - b
  );

  try {
    await prisma.storeSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        openTime: open,
        closeTime: close,
        pickupSlots,
        minOrderValue: parsed.data.minOrderValue,
        advanceNoticeDays: parsed.data.advanceNoticeDays,
        allowedPreOrderDays: allowed,
        operatingHours: toOperatingHoursJson(
          parsed.data.operatingHours ?? null
        ),
      },
      update: {
        openTime: open,
        closeTime: close,
        pickupSlots,
        minOrderValue: parsed.data.minOrderValue,
        advanceNoticeDays: parsed.data.advanceNoticeDays,
        allowedPreOrderDays: allowed,
        operatingHours: toOperatingHoursJson(
          parsed.data.operatingHours ?? null
        ),
      },
    });
    revalidateSettings();
    return { success: true };
  } catch (error) {
    console.error("saveStoreSettings:", error);
    return { error: "Não foi possível salvar as configurações." };
  }
}

export async function setNotificationSoundEnabled(
  raw: unknown
): Promise<SettingsActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = z.boolean().safeParse(raw);
  if (!parsed.success) {
    return { error: "Valor inválido." };
  }

  try {
    await prisma.storeSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        notificationSoundEnabled: parsed.data,
      },
      update: {
        notificationSoundEnabled: parsed.data,
      },
    });
    revalidateSoundSettings();
    return { success: true };
  } catch (error) {
    console.error("setNotificationSoundEnabled:", error);
    return { error: "Não foi possível atualizar o som de notificações." };
  }
}

export async function removeNotificationSound(): Promise<SettingsActionState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  try {
    const current = await prisma.storeSettings.findUnique({
      where: { id: "default" },
      select: { notificationSoundUrl: true },
    });
    const pathname = current?.notificationSoundUrl
      ? extractBlobPathnameFromFileUrl(current.notificationSoundUrl)
      : null;

    await prisma.storeSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        notificationSoundUrl: null,
        notificationSoundName: null,
        notificationSoundSize: null,
        notificationSoundUpdatedAt: null,
      },
      update: {
        notificationSoundUrl: null,
        notificationSoundName: null,
        notificationSoundSize: null,
        notificationSoundUpdatedAt: null,
      },
    });

    if (pathname) {
      await deleteBlobQuietly(pathname);
    }

    revalidateSoundSettings();
    return { success: true };
  } catch (error) {
    console.error("removeNotificationSound:", error);
    return { error: "Não foi possível remover o áudio." };
  }
}

export async function getNotificationSoundConfig(): Promise<{
  enabled: boolean;
  url: string | null;
}> {
  try {
    await requireAdmin();
  } catch {
    return { enabled: false, url: null };
  }

  const settings = await getStoreSettings();
  return {
    enabled: settings.notificationSoundEnabled,
    url: sanitizeNotificationSoundSrc(settings.notificationSoundUrl),
  };
}

export type { StoreSettingsData };
