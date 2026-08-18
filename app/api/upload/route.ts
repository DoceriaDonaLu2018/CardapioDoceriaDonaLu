import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { headers } from "next/headers";

import { auth } from "@/auth";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  sniffImageContentType,
} from "@/lib/images";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";

const MAX_SIZE_IN_BYTES = 4 * 1024 * 1024;

/** Nome seguro para Blob — remove path e caracteres perigosos. */
function safeUploadName(original: string, contentType: string): string {
  const base = original.split(/[/\\]/).pop() || "upload";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const extFromType =
    contentType === "image/jpeg"
      ? ".jpg"
      : contentType === "image/png"
        ? ".png"
        : contentType === "image/webp"
          ? ".webp"
          : contentType === "image/gif"
            ? ".gif"
            : "";
  if (/\.(jpe?g|png|webp|gif)$/i.test(cleaned)) return cleaned;
  return `${cleaned || "upload"}${extFromType}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Armazenamento não configurado. Adicione BLOB_READ_WRITE_TOKEN nas variáveis da Vercel.",
      },
      { status: 500 }
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const uploadLimit = assertMemoryRateLimit(
    `upload:ip:${ip}`,
    20,
    15 * 60 * 1000
  );
  if (!uploadLimit.ok) {
    return NextResponse.json(
      {
        error: `Muitos uploads. Aguarde ${uploadLimit.retryAfterSec}s e tente novamente.`,
      },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_IN_BYTES) {
    return NextResponse.json(
      { error: "A imagem deve ter no máximo 4 MB." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedType = sniffImageContentType(bytes);
  if (!sniffedType) {
    return NextResponse.json(
      { error: "Formato inválido. Use JPG, PNG, WEBP ou GIF." },
      { status: 400 }
    );
  }

  try {
    const filename = safeUploadName(file.name || "upload", sniffedType);
    const blob = await put(filename, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: true,
      contentType: sniffedType,
    });

    const url = `/api/file?pathname=${encodeURIComponent(blob.pathname)}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("api/upload:", error);
    return NextResponse.json(
      { error: "Falha no upload da imagem." },
      { status: 500 }
    );
  }
}
