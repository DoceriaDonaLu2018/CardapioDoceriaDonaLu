import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { auth } from "@/auth";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado." },
      { status: 400 }
    );
  }

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Formato inválido. Use JPG, PNG, WEBP ou GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_IN_BYTES) {
    return NextResponse.json(
      { error: "A imagem deve ter no máximo 4 MB." },
      { status: 400 }
    );
  }

  try {
    const filename = safeUploadName(file.name || "upload", file.type);
    const blob = await put(filename, file, {
      access: "private",
      addRandomSuffix: true,
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
