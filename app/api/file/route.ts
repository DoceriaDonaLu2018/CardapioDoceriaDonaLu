import { type NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

import { blobPathnameSchema } from "@/lib/validation/safe-input";

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
          "Cache-Control": "public, max-age=0, must-revalidate",
        },
      });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        "Cache-Control": "public, max-age=0, must-revalidate",
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
