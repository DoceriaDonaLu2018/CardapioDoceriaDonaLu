/**
 * Validação de CPF (módulo 11). Entrada maliciosa é rejeitada — nunca persistir o número.
 */

export function normalizeCpf(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 11);
}

export function formatCpfMask(raw: string): string {
  const digits = normalizeCpf(raw);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  if (digits.length <= 3) return p1;
  if (digits.length <= 6) return `${p1}.${p2}`;
  if (digits.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

function verifierDigit(base: string, factorStart: number): number {
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += Number(base[i]) * (factorStart - i);
  }
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

export function isValidCpf(raw: string): boolean {
  const cpf = normalizeCpf(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const d1 = verifierDigit(cpf.slice(0, 9), 10);
  if (d1 !== Number(cpf[9])) return false;

  const d2 = verifierDigit(cpf.slice(0, 10), 11);
  return d2 === Number(cpf[10]);
}
