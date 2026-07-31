/**
 * Helpers de URL de imagem — alinhados à allowlist do Zod / upload.
 */

const PLACEHOLDER_PRODUCT =
  "https://placehold.co/800x450/cf2d6c/ffffff?text=Dona+Lu";

export function getProductImageFallback(): string {
  return PLACEHOLDER_PRODUCT;
}

/** True se a string é uma URL de imagem permitida pelo sistema. */
export function isAllowedImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/api/file?pathname=")) return true;
  if (trimmed.startsWith("https://placehold.co/")) return true;
  if (trimmed.startsWith("https://images.unsplash.com/")) return true;
  try {
    const url = new URL(trimmed);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export function sanitizeImageSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const value = src.trim();
  if (!value) return null;
  return isAllowedImageUrl(value) ? value : null;
}

/**
 * Normaliza imageUrl para persistência.
 * Vazio / inválido → placeholder (nunca string corrompida).
 */
export function normalizeProductImageUrl(src: unknown): string {
  return sanitizeImageSrc(src) ?? PLACEHOLDER_PRODUCT;
}

/** Proxy /api/file: evita otimizador (query string + stream da Blob). */
export function shouldBypassImageOptimization(src: string): boolean {
  return src.startsWith("/api/file?");
}
