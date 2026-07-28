import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  STORE_HOURS,
  STORE_HOURS_LABEL as FALLBACK_HOURS_LABEL,
} from "@/lib/store-info";

export const TIME_HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:mm).");

export const storeSettingsSchema = z.object({
  openTime: TIME_HHMM,
  closeTime: TIME_HHMM,
  pickupSlots: z
    .array(TIME_HHMM)
    .max(48, "Máximo de 48 horários.")
    .superRefine((slots, ctx) => {
      const unique = new Set(slots);
      if (unique.size !== slots.length) {
        ctx.addIssue({
          code: "custom",
          message: "Remova horários duplicados.",
        });
      }
    }),
});

export type StoreSettingsData = {
  openTime: string;
  closeTime: string;
  pickupSlots: string[];
};

const DEFAULTS: StoreSettingsData = {
  openTime: "12:00",
  closeTime: "18:00",
  pickupSlots: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
};

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Slots válidos: dentro do intervalo [open, close] inclusive. */
export function filterSlotsWithinHours(
  slots: string[],
  openTime: string,
  closeTime: string
): string[] {
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  return [...new Set(slots)]
    .filter((slot) => {
      const t = timeToMinutes(slot);
      return t >= open && t <= close;
    })
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

export async function getStoreSettings(): Promise<StoreSettingsData> {
  try {
    const row = await prisma.storeSettings.findUnique({
      where: { id: "default" },
      select: { openTime: true, closeTime: true, pickupSlots: true },
    });
    if (!row) return DEFAULTS;
    return {
      openTime: row.openTime || DEFAULTS.openTime,
      closeTime: row.closeTime || DEFAULTS.closeTime,
      pickupSlots:
        row.pickupSlots.length > 0 ? row.pickupSlots : DEFAULTS.pickupSlots,
    };
  } catch (error) {
    console.error("getStoreSettings:", error);
    return DEFAULTS;
  }
}

export async function getSelectablePickupSlots(): Promise<string[]> {
  const settings = await getStoreSettings();
  return filterSlotsWithinHours(
    settings.pickupSlots,
    settings.openTime,
    settings.closeTime
  );
}

export function formatStoreHoursLabel(openTime: string, closeTime: string): string {
  return `Horário de Funcionamento: ${openTime} às ${closeTime}`;
}

export function storeHoursLabelOrFallback(
  openTime?: string,
  closeTime?: string
): string {
  if (openTime && closeTime) return formatStoreHoursLabel(openTime, closeTime);
  return FALLBACK_HOURS_LABEL || `Horário de Funcionamento: ${STORE_HOURS}`;
}
