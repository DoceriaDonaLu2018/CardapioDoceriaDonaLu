import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  STORE_HOURS,
  STORE_HOURS_LABEL as FALLBACK_HOURS_LABEL,
} from "@/lib/store-info";
import { sanitizeNotificationSoundSrc } from "@/lib/audio/mp3";

export const TIME_HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:mm).");

export const dayOperatingHoursSchema = z.object({
  closed: z.boolean(),
  open: TIME_HHMM,
  close: TIME_HHMM,
});

export type DayOperatingHours = z.infer<typeof dayOperatingHoursSchema>;

/** Mapa 0–6 (dom–sáb) → horário do dia. */
export type OperatingHoursMap = Record<string, DayOperatingHours>;

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
  minOrderValue: z.number().finite().min(0).max(1_000_000).default(0),
  advanceNoticeDays: z.number().int().min(0).max(60).default(0),
  allowedPreOrderDays: z
    .array(z.number().int().min(0).max(6))
    .min(0)
    .max(7)
    .default([1, 2, 3, 4, 5, 6]),
  operatingHours: z
    .record(z.string(), dayOperatingHoursSchema)
    .optional()
    .nullable(),
});

export type StoreSettingsData = {
  openTime: string;
  closeTime: string;
  pickupSlots: string[];
  minOrderValue: number;
  advanceNoticeDays: number;
  allowedPreOrderDays: number[];
  operatingHours: OperatingHoursMap | null;
  notificationSoundEnabled: boolean;
  notificationSoundUrl: string | null;
  notificationSoundName: string | null;
  notificationSoundSize: number | null;
  notificationSoundUpdatedAt: string | null;
  receptionOpen: boolean;
  receptionOpenedOnDate: string | null;
  receptionClosedReason: string | null;
};

const DEFAULTS: StoreSettingsData = {
  openTime: "12:00",
  closeTime: "18:00",
  pickupSlots: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  minOrderValue: 0,
  advanceNoticeDays: 0,
  allowedPreOrderDays: [1, 2, 3, 4, 5, 6],
  operatingHours: null,
  notificationSoundEnabled: true,
  notificationSoundUrl: null,
  notificationSoundName: null,
  notificationSoundSize: null,
  notificationSoundUpdatedAt: null,
  receptionOpen: false,
  receptionOpenedOnDate: null,
  receptionClosedReason: null,
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

function parseOperatingHours(value: unknown): OperatingHoursMap | null {
  if (value == null) return null;
  const parsed = z
    .record(z.string(), dayOperatingHoursSchema)
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getStoreSettings(): Promise<StoreSettingsData> {
  try {
    const row = await prisma.storeSettings.findUnique({
      where: { id: "default" },
    });
    if (!row) return DEFAULTS;
    return {
      openTime: row.openTime || DEFAULTS.openTime,
      closeTime: row.closeTime || DEFAULTS.closeTime,
      pickupSlots:
        row.pickupSlots.length > 0 ? row.pickupSlots : DEFAULTS.pickupSlots,
      minOrderValue: row.minOrderValue ?? DEFAULTS.minOrderValue,
      advanceNoticeDays: row.advanceNoticeDays ?? DEFAULTS.advanceNoticeDays,
      allowedPreOrderDays:
        row.allowedPreOrderDays?.length > 0
          ? row.allowedPreOrderDays
          : DEFAULTS.allowedPreOrderDays,
      operatingHours: parseOperatingHours(row.operatingHours),
      notificationSoundEnabled: row.notificationSoundEnabled ?? true,
      notificationSoundUrl: sanitizeNotificationSoundSrc(
        row.notificationSoundUrl
      ),
      notificationSoundName: row.notificationSoundName,
      notificationSoundSize: row.notificationSoundSize,
      notificationSoundUpdatedAt: row.notificationSoundUpdatedAt
        ? row.notificationSoundUpdatedAt.toISOString()
        : null,
      receptionOpen: row.receptionOpen ?? false,
      receptionOpenedOnDate: row.receptionOpenedOnDate ?? null,
      receptionClosedReason: row.receptionClosedReason ?? null,
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

export function toOperatingHoursJson(
  value: OperatingHoursMap | null | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!value) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export { DEFAULTS as STORE_SETTINGS_DEFAULTS };
