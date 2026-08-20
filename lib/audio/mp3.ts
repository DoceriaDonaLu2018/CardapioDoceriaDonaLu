/**
 * Validação de MP3 para som de notificação.
 * Não confiar em file.type / extensão do cliente — magic numbers no servidor.
 */

export const NOTIFICATION_SOUND_MAX_BYTES = 4 * 1024 * 1024;
export const NOTIFICATION_SOUND_MIME = "audio/mpeg";
export const DEFAULT_NOTIFICATION_SOUND_SRC = "/sounds/new-order.wav";

const FILE_PROXY_PREFIX = "/api/file?pathname=";

/** True se o conteúdo for MPEG Layer III (com ou sem ID3v2). */
export function sniffMp3ContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 3) return null;

  if (hasId3v2Header(bytes)) {
    const frameOffset = id3v2PayloadOffset(bytes);
    if (frameOffset != null && looksLikeMpegLayerIiiFrame(bytes, frameOffset)) {
      return NOTIFICATION_SOUND_MIME;
    }
    // ID3 presente mas frame ainda não encontrado no prefixo: aceita se o
    // restante do arquivo tiver um sync MPEG (arquivos com tags grandes).
    if (findMpegLayerIiiFrame(bytes, Math.min(bytes.length, 10 * 1024)) >= 0) {
      return NOTIFICATION_SOUND_MIME;
    }
    return null;
  }

  if (looksLikeMpegLayerIiiFrame(bytes, 0)) {
    return NOTIFICATION_SOUND_MIME;
  }

  return null;
}

function hasId3v2Header(bytes: Uint8Array): boolean {
  return bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
}

/** Offset do primeiro byte após o header ID3v2 (tamanho synchsafe). */
function id3v2PayloadOffset(bytes: Uint8Array): number | null {
  if (bytes.length < 10 || !hasId3v2Header(bytes)) return null;
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const offset = 10 + size;
  if (offset < 10 || offset >= bytes.length) return null;
  return offset;
}

function looksLikeMpegLayerIiiFrame(bytes: Uint8Array, offset: number): boolean {
  if (offset + 2 >= bytes.length) return false;
  if (bytes[offset] !== 0xff) return false;
  const b = bytes[offset + 1];
  if ((b & 0xe0) !== 0xe0) return false;
  const version = (b >> 3) & 0x03;
  const layer = (b >> 1) & 0x03;
  // version 01 = reservado; layer 01 = Layer III (MP3)
  if (version === 0x01) return false;
  return layer === 0x01;
}

function findMpegLayerIiiFrame(bytes: Uint8Array, limit: number): number {
  const max = Math.min(bytes.length - 2, limit);
  for (let i = 0; i < max; i += 1) {
    if (looksLikeMpegLayerIiiFrame(bytes, i)) return i;
  }
  return -1;
}

function isSafeBlobPathname(pathname: string): boolean {
  if (!pathname || pathname.length > 500) return false;
  if (pathname.includes("..")) return false;
  if (/^https?:\/\//i.test(pathname)) return false;
  if (pathname.startsWith("/") || pathname.includes("\\")) return false;
  return /^[a-zA-Z0-9._\-/]+$/.test(pathname);
}

export function extractBlobPathnameFromFileUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith(FILE_PROXY_PREFIX)) return null;
  const raw = trimmed.slice(FILE_PROXY_PREFIX.length).split("&")[0] ?? "";
  let pathname = raw;
  try {
    pathname = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!isSafeBlobPathname(pathname)) return null;
  return pathname;
}

/** URL persistida: somente proxy interno de um .mp3 no Blob. */
export function isAllowedNotificationSoundUrl(value: string): boolean {
  const pathname = extractBlobPathnameFromFileUrl(value);
  if (!pathname) return false;
  return pathname.toLowerCase().endsWith(".mp3");
}

export function sanitizeNotificationSoundSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const value = src.trim();
  if (!value) return null;
  return isAllowedNotificationSoundUrl(value) ? value : null;
}

export function safeMp3BlobPath(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() || "notificacao";
  const withoutExt = base
    .replace(/\.mp3$/i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);
  return `notification-sounds/${withoutExt || "notificacao"}.mp3`;
}

export function sanitizeDisplayFileName(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() || "notificacao.mp3";
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 80);
  if (/\.mp3$/i.test(cleaned)) return cleaned;
  return `${cleaned || "notificacao"}.mp3`;
}

export function formatSoundFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  })} MB`;
}
