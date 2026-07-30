import { toZonedTime } from "date-fns-tz";
import { differenceInCalendarDays } from "date-fns";

import { BRASILIA_TZ } from "@/lib/timezone";
import {
  getStoreSettings,
  type DayOperatingHours,
  type StoreSettingsData,
} from "@/lib/store-settings";

export type StoreStatusKind =
  | "open"
  | "closed"
  | "preorder_ok"
  | "preorder_invalid";

export type StoreStatusResult = {
  kind: StoreStatusKind;
  isOpen: boolean;
  canCheckoutPickup: boolean;
  canCheckoutScheduled: boolean;
  message: string;
  nextOpenTime: string | null;
  nowLabel: string;
};

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getBrasiliaParts(now: Date) {
  const zoned = toZonedTime(now, BRASILIA_TZ);
  const weekday = zoned.getDay(); // 0=dom … 6=sáb
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`;
  const timeLabel = `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`;
  return {
    zoned,
    weekday,
    minutesOfDay: zoned.getHours() * 60 + zoned.getMinutes(),
    dateStr,
    timeLabel,
  };
}

function weekdayFromYmd(dateStr: string): number {
  // Meio-dia UTC evita flip de dia perto de meia-noite em SP.
  return toZonedTime(new Date(`${dateStr}T15:00:00.000Z`), BRASILIA_TZ).getDay();
}

function hoursForDay(
  settings: StoreSettingsData,
  weekday: number
): DayOperatingHours {
  const fromMap = settings.operatingHours?.[String(weekday)];
  if (fromMap) return fromMap;
  return {
    closed: false,
    open: settings.openTime,
    close: settings.closeTime,
  };
}

function isWithinHours(day: DayOperatingHours, minutesOfDay: number): boolean {
  if (day.closed) return false;
  const open = timeToMinutes(day.open);
  const close = timeToMinutes(day.close);
  if (close < open) {
    return minutesOfDay >= open || minutesOfDay <= close;
  }
  return minutesOfDay >= open && minutesOfDay <= close;
}

export function validateScheduledOrder(
  settings: StoreSettingsData,
  deliveryDate: string,
  now: Date = new Date()
): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return { ok: false, error: "Data da encomenda inválida." };
  }

  const { dateStr: todayStr } = getBrasiliaParts(now);
  const daysAhead = differenceInCalendarDays(
    new Date(`${deliveryDate}T12:00:00.000Z`),
    new Date(`${todayStr}T12:00:00.000Z`)
  );

  if (daysAhead < 0) {
    return { ok: false, error: "A data da encomenda não pode ser no passado." };
  }
  if (daysAhead < settings.advanceNoticeDays) {
    return {
      ok: false,
      error:
        settings.advanceNoticeDays <= 1
          ? "Encomendas exigem pelo menos 1 dia de antecedência."
          : `Encomendas exigem pelo menos ${settings.advanceNoticeDays} dias de antecedência.`,
    };
  }

  const weekday = weekdayFromYmd(deliveryDate);
  if (!settings.allowedPreOrderDays.includes(weekday)) {
    return {
      ok: false,
      error: "Este dia da semana não está disponível para encomendas.",
    };
  }

  const dayHours = hoursForDay(settings, weekday);
  if (dayHours.closed) {
    return { ok: false, error: "A loja não funciona neste dia." };
  }

  return { ok: true };
}

export function evaluateStoreStatus(
  settings: StoreSettingsData,
  options?: {
    now?: Date;
    fulfillmentMode?: "pickup" | "scheduled";
    deliveryDate?: string | null;
  }
): StoreStatusResult {
  const now = options?.now ?? new Date();
  const parts = getBrasiliaParts(now);
  const todayHours = hoursForDay(settings, parts.weekday);
  const isOpen = isWithinHours(todayHours, parts.minutesOfDay);
  const nowLabel = `${parts.dateStr} ${parts.timeLabel} (Brasília)`;

  const nextOpenTime = todayHours.closed
    ? settings.openTime
    : isOpen
      ? null
      : parts.minutesOfDay < timeToMinutes(todayHours.open)
        ? todayHours.open
        : settings.openTime;

  if (options?.fulfillmentMode === "scheduled") {
    const date = options.deliveryDate;
    if (!date) {
      return {
        kind: "preorder_invalid",
        isOpen,
        canCheckoutPickup: isOpen,
        canCheckoutScheduled: false,
        message: "Informe a data da encomenda.",
        nextOpenTime,
        nowLabel,
      };
    }
    const scheduled = validateScheduledOrder(settings, date, now);
    if (!scheduled.ok) {
      return {
        kind: "preorder_invalid",
        isOpen,
        canCheckoutPickup: isOpen,
        canCheckoutScheduled: false,
        message: scheduled.error,
        nextOpenTime,
        nowLabel,
      };
    }
    return {
      kind: "preorder_ok",
      isOpen,
      canCheckoutPickup: isOpen,
      canCheckoutScheduled: true,
      message: "Encomenda válida.",
      nextOpenTime,
      nowLabel,
    };
  }

  if (isOpen) {
    return {
      kind: "open",
      isOpen: true,
      canCheckoutPickup: true,
      canCheckoutScheduled: true,
      message: "Loja aberta.",
      nextOpenTime: null,
      nowLabel,
    };
  }

  const reopen = nextOpenTime ?? todayHours.open ?? settings.openTime;

  return {
    kind: "closed",
    isOpen: false,
    canCheckoutPickup: false,
    canCheckoutScheduled: settings.allowedPreOrderDays.length > 0,
    message: `A loja está fechada no momento. Retornaremos às ${reopen}.`,
    nextOpenTime: reopen,
    nowLabel,
  };
}

export async function checkStoreStatus(options?: {
  now?: Date;
  fulfillmentMode?: "pickup" | "scheduled";
  deliveryDate?: string | null;
}): Promise<StoreStatusResult> {
  const settings = await getStoreSettings();
  return evaluateStoreStatus(settings, options);
}
