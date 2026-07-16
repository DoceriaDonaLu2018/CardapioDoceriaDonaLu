import { BRASILIA_TZ } from "@/lib/timezone";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata um número como moeda brasileira. Ex.: 7 -> "R$ 7,00" */
export function formatPrice(value: number): string {
  return currencyFormatter.format(value);
}

/** Formata percentual. Ex.: 42.5 -> "42,5%" */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/**
 * Formata um telefone brasileiro conforme o usuário digita.
 * Aceita 10 dígitos (fixo) ou 11 dígitos (celular).
 * Ex.: "11964862693" -> "(11) 96486-2693"
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (rest.length <= 4) return `(${ddd}) ${rest}`;

  // Celular (9 dígitos) usa 5 dígitos antes do traço; fixo usa 4.
  const splitAt = rest.length > 8 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`;
}

/** Formata data e hora em Brasília. Ex.: "12/07/2026, 14:30" */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: BRASILIA_TZ,
  }).format(date);
}
