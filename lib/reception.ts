import { prisma } from "@/lib/prisma";
import { getBrasiliaDateString } from "@/lib/timezone";
import { getStoreSettings, type StoreSettingsData } from "@/lib/store-settings";
import {
  getBrasiliaClock,
  hoursForDay,
  isWithinHours,
} from "@/lib/store-status";

export const ReceptionClosedReason = {
  MANUAL: "MANUAL",
  SCHEDULE: "SCHEDULE",
} as const;

export type ReceptionClosedReasonValue =
  (typeof ReceptionClosedReason)[keyof typeof ReceptionClosedReason];

export type ReceptionSnapshot = {
  isOpen: boolean;
  canOpen: boolean;
  hoursOpen: boolean;
  closedReason: ReceptionClosedReasonValue | null;
  openTime: string;
  closeTime: string;
  today: string;
};

function parseClosedReason(value: string | null): ReceptionClosedReasonValue | null {
  if (value === ReceptionClosedReason.MANUAL) return ReceptionClosedReason.MANUAL;
  if (value === ReceptionClosedReason.SCHEDULE) return ReceptionClosedReason.SCHEDULE;
  return null;
}

export function computeReceptionSnapshot(
  settings: StoreSettingsData,
  now: Date = new Date()
): ReceptionSnapshot {
  const clock = getBrasiliaClock(now);
  const todayHours = hoursForDay(settings, clock.weekday);
  const hoursOpen = isWithinHours(todayHours, clock.minutesOfDay);
  const sessionToday =
    settings.receptionOpen && settings.receptionOpenedOnDate === clock.dateStr;
  const closedReason =
    settings.receptionOpenedOnDate === clock.dateStr
      ? parseClosedReason(settings.receptionClosedReason)
      : null;

  return {
    isOpen: sessionToday && hoursOpen,
    canOpen: hoursOpen,
    hoursOpen,
    closedReason: sessionToday ? null : closedReason,
    openTime: todayHours.open,
    closeTime: todayHours.close,
    today: clock.dateStr,
  };
}

async function persistReceptionClose(input: {
  reason: ReceptionClosedReasonValue | null;
  date: string;
}): Promise<void> {
  await prisma.storeSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      receptionOpen: false,
      receptionOpenedOnDate: input.date,
      receptionClosedReason: input.reason,
    },
    update: {
      receptionOpen: false,
      receptionOpenedOnDate: input.date,
      receptionClosedReason: input.reason,
    },
  });
}

/**
 * Fonte da verdade: aplica fechamento automático / expiração do dia no banco
 * quando a sessão persistida ficou obsoleta. Idempotente.
 */
export async function syncReceptionState(
  now: Date = new Date()
): Promise<StoreSettingsData> {
  const settings = await getStoreSettings();
  const clock = getBrasiliaClock(now);
  const todayHours = hoursForDay(settings, clock.weekday);
  const hoursOpen = isWithinHours(todayHours, clock.minutesOfDay);

  if (!settings.receptionOpen) return settings;

  if (settings.receptionOpenedOnDate !== clock.dateStr) {
    await persistReceptionClose({ reason: null, date: clock.dateStr });
    return {
      ...settings,
      receptionOpen: false,
      receptionOpenedOnDate: clock.dateStr,
      receptionClosedReason: null,
    };
  }

  if (!hoursOpen) {
    await persistReceptionClose({
      reason: ReceptionClosedReason.SCHEDULE,
      date: clock.dateStr,
    });
    return {
      ...settings,
      receptionOpen: false,
      receptionClosedReason: ReceptionClosedReason.SCHEDULE,
    };
  }

  return settings;
}

export async function getReceptionSnapshot(
  now: Date = new Date()
): Promise<ReceptionSnapshot> {
  const settings = await syncReceptionState(now);
  return computeReceptionSnapshot(settings, now);
}

export async function openReception(now: Date = new Date()): Promise<
  | { ok: true; snapshot: ReceptionSnapshot }
  | { ok: false; error: string }
> {
  const settings = await syncReceptionState(now);
  const snapshot = computeReceptionSnapshot(settings, now);

  if (!snapshot.canOpen) {
    return {
      ok: false,
      error: `Horário de funcionamento encerrado (fecha às ${snapshot.closeTime}). A recepção pode ser iniciada a partir das ${snapshot.openTime}.`,
    };
  }

  if (snapshot.isOpen) {
    return { ok: true, snapshot };
  }

  const today = getBrasiliaDateString(now);
  await prisma.storeSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      receptionOpen: true,
      receptionOpenedOnDate: today,
      receptionClosedReason: null,
    },
    update: {
      receptionOpen: true,
      receptionOpenedOnDate: today,
      receptionClosedReason: null,
    },
  });

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      isOpen: true,
      closedReason: null,
    },
  };
}

export async function closeReceptionManual(now: Date = new Date()): Promise<
  | { ok: true; snapshot: ReceptionSnapshot }
  | { ok: false; error: string }
> {
  const today = getBrasiliaDateString(now);
  await persistReceptionClose({
    reason: ReceptionClosedReason.MANUAL,
    date: today,
  });

  const settings = await getStoreSettings();
  return { ok: true, snapshot: computeReceptionSnapshot(settings, now) };
}

/** Usado pelo cron: só persiste se a sessão ainda estiver aberta fora do horário. */
export async function closeReceptionIfPastHours(now: Date = new Date()) {
  const before = await getStoreSettings();
  const after = await syncReceptionState(now);
  return {
    closed:
      before.receptionOpen &&
      !after.receptionOpen &&
      after.receptionClosedReason === ReceptionClosedReason.SCHEDULE,
    snapshot: computeReceptionSnapshot(after, now),
  };
}
