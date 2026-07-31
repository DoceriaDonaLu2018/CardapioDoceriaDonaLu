"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";

import { SafeImage } from "@/components/ui/safe-image";
import { sanitizeImageSrc } from "@/lib/images";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  /** Nome do input escondido que carrega a URL para o formulário. */
  name: string;
  /** URL já existente (ao editar um produto). */
  defaultValue?: string;
}

const MAX_SIZE_IN_BYTES = 4 * 1024 * 1024; // 4 MB (limite seguro na Vercel)
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Upload + preview robusto:
 * - Mostra imageUrl salva ao editar
 * - Prévia local (blob:) imediatamente ao escolher arquivo
 * - Persiste só URL sanitizada do /api/upload
 */
export function ImageUpload({ name, defaultValue = "" }: ImageUploadProps) {
  const initial = sanitizeImageSrc(defaultValue) ?? "";
  const [url, setUrl] = useState(initial);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const localPreviewRef = useRef<string | null>(null);

  function revokeLocalPreview() {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setLocalPreview(null);
  }

  // Reabre o sheet / troca de produto → sincroniza com o banco.
  useEffect(() => {
    const next = sanitizeImageSrc(defaultValue) ?? "";
    setUrl(next);
    setRemoteFailed(false);
    setError(null);
    revokeLocalPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando defaultValue muda
  }, [defaultValue]);

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  async function uploadFile(file: File) {
    setError(null);
    setRemoteFailed(false);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato inválido. Use JPG, PNG, WEBP ou GIF.");
      return;
    }
    if (file.size > MAX_SIZE_IN_BYTES) {
      setError("A imagem deve ter no máximo 4 MB.");
      return;
    }

    revokeLocalPreview();
    const objectUrl = URL.createObjectURL(file);
    localPreviewRef.current = objectUrl;
    setLocalPreview(objectUrl);

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Falha no upload. Tente novamente.");
      }

      const uploaded = sanitizeImageSrc(data.url);
      if (!uploaded) {
        throw new Error("Resposta inválida do servidor.");
      }

      setUrl(uploaded);
      revokeLocalPreview();
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Falha no upload. Tente novamente.";
      setError(message);
      // Mantém prévia local para o admin ver o que tentou enviar.
    } finally {
      setIsUploading(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function clearImage() {
    setUrl("");
    setRemoteFailed(false);
    setError(null);
    revokeLocalPreview();
  }

  const showPreview = Boolean(localPreview) || (Boolean(url) && !remoteFailed);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={url} />

      {showPreview ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
          {localPreview ? (
            // Prévia imediata do arquivo local (antes/durante upload).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={localPreview}
              alt="Prévia da imagem selecionada"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <SafeImage
              src={url}
              alt="Prévia da imagem do produto"
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              className="object-cover"
              onLoadError={() => setRemoteFailed(true)}
            />
          )}

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}

          <div className="absolute right-2 top-2 flex gap-1">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading}
              aria-label="Trocar imagem"
              className="rounded-md bg-white/90 p-1.5 text-stone-700 shadow-sm transition-colors hover:bg-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={clearImage}
              disabled={isUploading}
              aria-label="Remover imagem"
              className="rounded-md bg-white/90 p-1.5 text-red-600 shadow-sm transition-colors hover:bg-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : url && remoteFailed ? (
        <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-center">
          <ImageOff className="h-8 w-8 text-amber-600" />
          <p className="text-sm text-amber-800">
            Não foi possível carregar a imagem salva. Envie outra foto.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm ring-1 ring-stone-200"
            >
              Escolher imagem
            </button>
            <button
              type="button"
              onClick={clearImage}
              className="rounded-md px-3 py-1.5 text-xs text-red-600"
            >
              Remover
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openFilePicker();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
            isDragging
              ? "border-coffee-500 bg-coffee-50"
              : "border-stone-300 bg-stone-50 hover:border-coffee-400 hover:bg-coffee-50/50"
          )}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-coffee-600" />
              <p className="text-sm text-stone-500">Enviando imagem...</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-7 w-7 text-coffee-500" />
              <p className="text-sm font-medium text-stone-700">
                Clique para selecionar ou arraste uma imagem
              </p>
              <p className="text-xs text-stone-400">
                JPG, PNG, WEBP ou GIF · até 4 MB
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleInputChange}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
