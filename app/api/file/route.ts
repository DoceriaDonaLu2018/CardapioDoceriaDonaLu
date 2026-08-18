import { type NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

import { ALLOWED_IMAGE_CONTENT_TYPES } from "@/lib/images";
import { blobPathnameSchema } from "@/lib/validation/safe-input";

const FILE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cache-Control": "public, max-age=0, must-revalidate",
} as const;

function contentTypeFromPathname(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

/**
 * Serve imagens da Blob store privada.
 * Pathname é validado (Zod) contra path traversal e URLs absolutas — mitiga LFI/SSRF-like.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("pathname");
  const parsed = blobPathnameSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parâmetro 'pathname' inválido." },
      { status: 400 }
    );
  }

  const pathname = parsed.data;

  try {
    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });

    if (!result) {
      return new NextResponse("Imagem não encontrada.", { status: 404 });
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          ...FILE_SECURITY_HEADERS,
        },
      });
    }

    const rawType = (result.blob.contentType ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const fromPath = contentTypeFromPathname(pathname);
    const contentType =
      rawType === "image/jpg"
        ? "image/jpeg"
        : ALLOWED_IMAGE_CONTENT_TYPES.has(rawType)
          ? rawType
          : fromPath;

    if (!contentType || !ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não permitido." },
        { status: 415 }
      );
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": contentType,
        ETag: result.blob.etag,
        ...FILE_SECURITY_HEADERS,
      },
    });
  } catch (error) {
    console.error("api/file:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a imagem." },
      { status: 500 }
    );
  }
}
