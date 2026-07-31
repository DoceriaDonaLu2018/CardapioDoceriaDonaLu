/**
 * Helpers de URL de imagem — alinhados à allowlist do Zod / upload.
 */

export function sanitizeImageSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const value = src.trim();
  if (!value) return null;

  // Proxy interno (Blob privada) — padrão do upload admin.
  if (value.startsWith("/api/file?pathname=")) return value;

  // Placeholders e seed conhecidos.
  if (value.startsWith("https://placehold.co/")) return value;
  if (value.startsWith("https://images.unsplash.com/")) return value;

  // Blob pública Vercel (legado / raro).
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com")
    ) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

/** Proxy /api/file: evita otimizador (query string + stream da Blob). */
export function shouldBypassImageOptimization(src: string): boolean {
  return src.startsWith("/api/file?");
}
