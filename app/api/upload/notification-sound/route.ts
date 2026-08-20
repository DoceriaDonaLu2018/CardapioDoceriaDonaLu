import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sniffImageContentType } from "@/lib/images";
import { assertMemoryRateLimit } from "@/lib/payments/rate-limit";
import {
  extractBlobPathnameFromFileUrl,
  NOTIFICATION_SOUND_MAX_BYTES,
  NOTIFICATION_SOUND_MIME,
  safeMp3BlobPath,
  sanitizeDisplayFileName,
  sniffMp3ContentType,
} from "@/lib/audio/mp3";
import { deleteBlobQuietly } from "@/lib/blob-delete";

export const runtime = "nodejs";

/**
 * Upload do MP3 de notificação (admin).
 * Valida magic bytes, grava no Blob privado e só então atualiza StoreSettings.
 * O arquivo anterior só é removido depois do sucesso no banco.
 */
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
    `upload-sound:ip:${ip}`,
    10,
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

  if (file.size > NOTIFICATION_SOUND_MAX_BYTES) {
    return NextResponse.json(
      { error: "O arquivo excede o tamanho máximo permitido (4 MB)." },
      { status: 400 }
    );
  }

  if (file.size < 256) {
    return NextResponse.json(
      { error: "Selecione um arquivo MP3 válido." },
      { status: 400 }
    );
  }

  const originalName = file.name || "notificacao.mp3";
  if (!/\.mp3$/i.test(originalName.split(/[/\\]/).pop() || "")) {
    return NextResponse.json(
      { error: "Selecione um arquivo MP3 válido." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (sniffImageContentType(bytes)) {
    return NextResponse.json(
      { error: "Selecione um arquivo MP3 válido." },
      { status: 400 }
    );
  }

  const sniffedType = sniffMp3ContentType(bytes);
  if (!sniffedType) {
    return NextResponse.json(
      { error: "Selecione um arquivo MP3 válido." },
      { status: 400 }
    );
  }

  const previous = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: { notificationSoundUrl: true },
  });
  const previousPathname = previous?.notificationSoundUrl
    ? extractBlobPathnameFromFileUrl(previous.notificationSoundUrl)
    : null;

  let blobPathname: string | null = null;

  try {
    const filename = safeMp3BlobPath(originalName);
    const blob = await put(filename, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: true,
      contentType: NOTIFICATION_SOUND_MIME,
    });
    blobPathname = blob.pathname;

    const url = `/api/file?pathname=${encodeURIComponent(blob.pathname)}`;
    const displayName = sanitizeDisplayFileName(originalName);
    const now = new Date();

    await prisma.storeSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        notificationSoundEnabled: true,
        notificationSoundUrl: url,
        notificationSoundName: displayName,
        notificationSoundSize: file.size,
        notificationSoundUpdatedAt: now,
      },
      update: {
        notificationSoundUrl: url,
        notificationSoundName: displayName,
        notificationSoundSize: file.size,
        notificationSoundUpdatedAt: now,
      },
    });

    if (previousPathname && previousPathname !== blob.pathname) {
      await deleteBlobQuietly(previousPathname);
    }

    revalidatePath("/admin/configuracoes");
    revalidatePath("/admin/pedidos");

    return NextResponse.json({
      url,
      name: displayName,
      size: file.size,
      updatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("api/upload/notification-sound:", error);
    if (blobPathname) {
      await deleteBlobQuietly(blobPathname);
    }
    return NextResponse.json(
      { error: "Não foi possível enviar o áudio." },
      { status: 500 }
    );
  }
}
