"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  Music,
  Pause,
  Play,
  RefreshCw,
  Upload,
} from "lucide-react";

import {
  removeNotificationSound,
  setNotificationSoundEnabled,
} from "@/app/admin/configuracoes/actions";
import { DeleteConfirmDialog } from "@/components/admin/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  formatSoundFileSize,
  NOTIFICATION_SOUND_MAX_BYTES,
  sanitizeNotificationSoundSrc,
} from "@/lib/audio/mp3";
import { BRASILIA_TZ } from "@/lib/timezone";
import type { StoreSettingsData } from "@/lib/store-settings";

type SoundState = {
  enabled: boolean;
  url: string | null;
  name: string | null;
  size: number | null;
  updatedAt: string | null;
};

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function NotificationSoundSettings({
  initial,
}: {
  initial: StoreSettingsData;
}) {
  const [sound, setSound] = useState<SoundState>({
    enabled: initial.notificationSoundEnabled,
    url: sanitizeNotificationSoundSrc(initial.notificationSoundUrl),
    name: initial.notificationSoundName,
    size: initial.notificationSoundSize,
    updatedAt: initial.notificationSoundUpdatedAt,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      const audio = previewRef.current;
      if (!audio) return;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // Prévia já encerrada.
      }
      previewRef.current = null;
    };
  }, []);

  function stopPreview() {
    const audio = previewRef.current;
    if (!audio) {
      setIsPlaying(false);
      return;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Ignora.
    }
    setIsPlaying(false);
  }

  function handleToggle(next: boolean) {
    setError(null);
    setSuccess(null);
    const previous = sound.enabled;
    setSound((current) => ({ ...current, enabled: next }));
    startTransition(async () => {
      const result = await setNotificationSoundEnabled(next);
      if (result.error) {
        setSound((current) => ({ ...current, enabled: previous }));
        setError(result.error);
        return;
      }
      setSuccess(
        next
          ? "Som de notificações ativado."
          : "Som de notificações desativado."
      );
    });
  }

  async function uploadFile(file: File) {
    setError(null);
    setSuccess(null);
    stopPreview();

    const name = file.name || "";
    if (!/\.mp3$/i.test(name)) {
      setError("Selecione um arquivo MP3 válido.");
      return;
    }
    if (file.size > NOTIFICATION_SOUND_MAX_BYTES) {
      setError("O arquivo excede o tamanho máximo permitido (4 MB).");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload/notification-sound", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        url?: string;
        name?: string;
        size?: number;
        updatedAt?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível enviar o áudio.");
      }

      const uploaded = sanitizeNotificationSoundSrc(data.url);
      if (!uploaded) {
        throw new Error("Resposta inválida do servidor.");
      }

      setSound((current) => ({
        ...current,
        url: uploaded,
        name: data.name ?? file.name,
        size: data.size ?? file.size,
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      }));
      setSuccess("Som de notificação atualizado.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Não foi possível enviar o áudio."
      );
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
  }

  function handlePreview() {
    if (!sound.url) return;
    setError(null);

    if (isPlaying) {
      stopPreview();
      return;
    }

    try {
      stopPreview();
      const audio = new Audio(sound.url);
      audio.preload = "auto";
      previewRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        setError("Não foi possível reproduzir o áudio.");
      };
      const playResult = audio.play();
      void Promise.resolve(playResult)
        .then(() => setIsPlaying(true))
        .catch((playError: unknown) => {
          setIsPlaying(false);
          const blocked =
            playError instanceof DOMException && playError.name === "NotAllowedError";
          setError(
            blocked
              ? "O navegador bloqueou o áudio. Clique em Ouvir novamente."
              : "Não foi possível reproduzir o áudio."
          );
        });
    } catch {
      setError("Não foi possível reproduzir o áudio.");
    }
  }

  const updatedLabel = formatUpdatedAt(sound.updatedAt);
  const busy = isUploading || isPending;

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div>
        <h2 className="font-serif text-lg font-bold text-stone-800">
          Notificações
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Som reproduzido na recepção quando chega um pedido novo. Sem arquivo
          personalizado, o alerta padrão do sistema continua valendo.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border border-stone-100 bg-stone-50 px-3 py-3">
        <div className="min-w-0">
          <Label htmlFor="notification-sound-enabled" className="text-stone-800">
            Som de notificações
          </Label>
          <p className="mt-0.5 text-xs text-stone-500">
            {sound.enabled
              ? "Ativado na loja. Cada computador da recepção ainda precisa liberar o áudio no navegador."
              : "Desativado na loja. A recepção não reproduz alerta sonoro."}
          </p>
        </div>
        <Switch
          id="notification-sound-enabled"
          checked={sound.enabled}
          disabled={busy}
          onCheckedChange={handleToggle}
          aria-label="Ativar som de notificações"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,.mp3"
        className="sr-only"
        onChange={handleFileChange}
      />

      {sound.url ? (
        <div className="space-y-3 rounded-lg border border-stone-200 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coffee-50 text-coffee-700">
              <Music className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-800">
                {sound.name || "som-notificacao.mp3"}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {sound.size != null ? formatSoundFileSize(sound.size) : null}
                {sound.size != null && updatedLabel ? " · " : null}
                {updatedLabel ? `Atualizado em ${updatedLabel}` : null}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={busy}
              aria-label={isPlaying ? "Pausar prévia do áudio" : "Ouvir áudio"}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Ouvir
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando áudio...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Substituir áudio
                </>
              )}
            </Button>
            <DeleteConfirmDialog
              title="Remover áudio"
              description="Remover o MP3 personalizado? A recepção voltará a usar o alerta padrão do sistema."
              confirmLabel="Remover áudio"
              pendingLabel="Removendo..."
              triggerLabel="Remover áudio"
              triggerSize="sm"
              triggerVariant="outline"
              triggerClassName="text-red-600 hover:bg-red-50 hover:text-red-700"
              showTrashIcon={false}
              onConfirm={async () => {
                stopPreview();
                const result = await removeNotificationSound();
                if (result.error) {
                  setError(result.error);
                  return result;
                }
                setSound((current) => ({
                  ...current,
                  url: null,
                  name: null,
                  size: null,
                  updatedAt: null,
                }));
                setSuccess("Áudio personalizado removido.");
                return result;
              }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-center">
          <p className="text-sm text-stone-600">
            Nenhum som personalizado configurado.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="border-coffee-200 text-coffee-800 hover:bg-coffee-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando áudio...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Adicionar áudio
              </>
            )}
          </Button>
          <p className="text-xs text-stone-400">MP3 · até 4 MB</p>
        </div>
      )}
    </section>
  );
}
