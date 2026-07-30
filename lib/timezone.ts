import { fromZonedTime } from "date-fns-tz";

export const BRASILIA_TZ = "America/Sao_Paulo";

/** YYYY-MM-DD do instante em Brasília. */
export function getBrasiliaDateString(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

/**
 * Interpreta valor de `<input type="datetime-local">` (sem fuso) como
 * horário de parede em Brasília → Date UTC correto.
 * Aceita "YYYY-MM-DDTHH:mm" ou "YYYY-MM-DDTHH:mm:ss".
 */
export function parseDatetimeLocalAsBrasilia(
  value: string | null | undefined
): Date | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");

  // Componentes = horário civil em Brasília; fromZonedTime → instante UTC.
  const asWallClock = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(asWallClock.getTime())) return null;

  const utc = fromZonedTime(asWallClock, BRASILIA_TZ);
  return Number.isNaN(utc.getTime()) ? null : utc;
}

/** Formata Date/ISO para value de datetime-local em Brasília. */
export function toDatetimeLocalBrasilia(
  iso: string | Date | null | undefined
): string {
  if (iso == null || iso === "") return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Meia-noite do dia atual em Brasília, como Date UTC. */
export function getBrasiliaStartOfDay(reference = new Date()): Date {
  const dateStr = getBrasiliaDateString(reference);

  // 00:00 em Brasília (UTC-3) = 03:00 UTC no mesmo dia civil.
  return new Date(`${dateStr}T03:00:00.000Z`);
}

/**
 * Intervalo [início, fim) de um dia civil em Brasília a partir de YYYY-MM-DD.
 * Ex.: "2026-07-25" → 00:00:00 até 23:59:59.999 (via lt do dia seguinte).
 */
export function getBrasiliaDayRange(dateStr: string): {
  gte: Date;
  lt: Date;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const gte = new Date(`${dateStr}T03:00:00.000Z`);
  if (Number.isNaN(gte.getTime())) return null;

  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

/** Subtrai dias a partir de uma data. */
export function subtractDays(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
