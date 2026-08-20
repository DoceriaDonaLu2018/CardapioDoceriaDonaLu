"use client";

import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SoundNotificationControlsProps = {
  isEnabled: boolean;
  volume: number;
  storeEnabled?: boolean;
  onEnable: () => void | Promise<boolean>;
  onDisable: () => void;
  onVolumeChange: (volume: number) => void;
  onTest: () => void | Promise<void>;
  className?: string;
};

export function SoundNotificationControls({
  isEnabled,
  volume,
  storeEnabled = true,
  onEnable,
  onDisable,
  onVolumeChange,
  onTest,
  className,
}: SoundNotificationControlsProps) {
  const muted = volume <= 0;
  const storeOffHint = !storeEnabled ? (
    <p className="text-xs text-amber-700">
      O som da loja está desativado em Configurações. Novos pedidos não tocam
      alerta até ser reativado lá.
    </p>
  ) : null;

  function handleEnableClick() {
    void Promise.resolve(onEnable()).catch((error) => {
      console.error("notification sound: falha ao ativar pela UI", error);
    });
  }

  function handleTestClick() {
    void Promise.resolve(onTest()).catch((error) => {
      console.error("notification sound: falha ao testar pela UI", error);
    });
  }

  if (!isEnabled) {
    return (
      <div
        className={cn(
          "flex flex-col items-stretch gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
          className
        )}
      >
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <BellOff className="h-4 w-4 shrink-0 text-stone-400" />
          Notificações sonoras desativadas
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={handleEnableClick}
          className="border-coffee-200 text-coffee-800 hover:bg-coffee-50"
        >
          <Bell className="h-4 w-4" />
          Ativar notificações sonoras
        </Button>
        {storeOffHint}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Bell className="h-4 w-4 shrink-0 text-coffee-600" />
          Notificações sonoras ativadas
        </p>
        <button
          type="button"
          onClick={onDisable}
          className="rounded px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
        >
          Desativar
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-stone-600">
          {muted ? (
            <VolumeX className="h-4 w-4 shrink-0 text-stone-400" />
          ) : (
            <Volume2 className="h-4 w-4 shrink-0 text-stone-500" />
          )}
          <span className="shrink-0">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            aria-label="Volume das notificações sonoras"
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-coffee-600"
          />
          <span className="w-10 shrink-0 text-right font-medium tabular-nums text-stone-700">
            {muted ? "Off" : `${volume}%`}
          </span>
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTestClick}
          className="shrink-0"
        >
          Testar som
        </Button>
      </div>
      {storeOffHint}
    </div>
  );
}
