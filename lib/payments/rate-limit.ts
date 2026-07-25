/**
 * Rate limit simples em memória + checagem no banco.
 * Em serverless multi-instância o Map é best-effort; a trava forte é o Prisma.
 */

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

export function assertMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const current = memoryBuckets.get(key);

  if (!current || current.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { ok: true };
}
