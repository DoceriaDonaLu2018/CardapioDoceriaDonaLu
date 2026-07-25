export const BRASILIA_TZ = "America/Sao_Paulo";

/** Meia-noite do dia atual em Brasília, como Date UTC. */
export function getBrasiliaStartOfDay(reference = new Date()): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);

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
