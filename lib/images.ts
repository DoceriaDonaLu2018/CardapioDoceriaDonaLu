/**
 * Helpers de URL de imagem — alinhados à allowlist do Zod / upload.
 */

const PLACEHOLDER_PRODUCT =
  "https://placehold.co/800x450/cf2d6c/ffffff?text=Dona+Lu";

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function getProductImageFallback(): string {
  return PLACEHOLDER_PRODUCT;
}

/**
 * Identifica o tipo real pelo magic number (não confiar em file.type do cliente).
 * Retorna null se o conteúdo não for uma imagem suportada.
 */
export function sniffImageContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/** Mesmas regras do blobPathnameSchema — sem import circular com safe-input. */
function isSafeBlobPathname(pathname: string): boolean {
  if (!pathname || pathname.length > 500) return false;
  if (pathname.includes("..")) return false;
  if (/^https?:\/\//i.test(pathname)) return false;
  if (pathname.startsWith("/") || pathname.includes("\\")) return false;
  return /^[a-zA-Z0-9._\-/]+$/.test(pathname);
}

function isAllowedFileProxyUrl(value: string): boolean {
  if (!value.startsWith("/api/file?pathname=")) return false;
  const raw = value.slice("/api/file?pathname=".length).split("&")[0] ?? "";
  let pathname = raw;
  try {
    pathname = decodeURIComponent(raw);
  } catch {
    return false;
  }
  return isSafeBlobPathname(pathname);
}

/** True se a string é uma URL de imagem permitida pelo sistema. */
export function isAllowedImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isAllowedFileProxyUrl(trimmed)) return true;
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
