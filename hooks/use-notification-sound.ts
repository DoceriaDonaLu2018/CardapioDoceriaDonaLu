"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_NOTIFICATION_SOUND_SRC,
  sanitizeNotificationSoundSrc,
} from "@/lib/audio/mp3";

const SOUND_SRC = DEFAULT_NOTIFICATION_SOUND_SRC;
const ENABLED_KEY = "ddl:sound-enabled";
const VOLUME_KEY = "ddl:sound-volume";
const ANNOUNCED_KEY = "ddl:sound-announced-orders";
const MAX_ANNOUNCED_IDS = 500;
const DEFAULT_VOLUME = 80;

type SoundPrefs = {
  enabled: boolean;
  volume: number;
};

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let audioBuffer: AudioBuffer | null = null;
let loadPromise: Promise<AudioBuffer | null> | null = null;
let cachedSoundSrc: string | null = null;
let storeSoundEnabledFlag = true;
let configuredSoundSrc = SOUND_SRC;

function currentSoundSrc(): string {
  return configuredSoundSrc;
}
let announcedHydrated = false;
const announcedOrderIds = new Set<string>();
const prefsListeners = new Set<() => void>();

const defaultPrefs: SoundPrefs = {
  enabled: false,
  volume: DEFAULT_VOLUME,
};

let cachedPrefs: SoundPrefs = defaultPrefs;
let prefsHydrated = false;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function readPrefsFromStorage(): SoundPrefs {
  try {
    const enabledRaw = window.localStorage.getItem(ENABLED_KEY);
    const volumeRaw = window.localStorage.getItem(VOLUME_KEY);
    return {
      enabled: enabledRaw === "1" || enabledRaw === "true",
      volume: volumeRaw == null ? DEFAULT_VOLUME : clampVolume(Number(volumeRaw)),
    };
  } catch {
    return defaultPrefs;
  }
}

function hydratePrefs(): SoundPrefs {
  if (typeof window === "undefined") return defaultPrefs;
  if (!prefsHydrated) {
    cachedPrefs = readPrefsFromStorage();
    prefsHydrated = true;
  }
  return cachedPrefs;
}

function persistPrefs(next: SoundPrefs): void {
  cachedPrefs = next;
  try {
    window.localStorage.setItem(ENABLED_KEY, next.enabled ? "1" : "0");
    window.localStorage.setItem(VOLUME_KEY, String(next.volume));
  } catch {
    // localStorage indisponível: preferência fica só em memória.
  }
  applyMasterGain(next.volume);
  prefsListeners.forEach((listener) => listener());
}

function subscribePrefs(listener: () => void): () => void {
  prefsListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key != null &&
      event.key !== ENABLED_KEY &&
      event.key !== VOLUME_KEY
    ) {
      return;
    }
    cachedPrefs = readPrefsFromStorage();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    prefsListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getPrefsSnapshot(): SoundPrefs {
  return hydratePrefs();
}

function getEnabledServerSnapshot(): boolean {
  return false;
}

function getVolumeServerSnapshot(): number {
  return DEFAULT_VOLUME;
}

function volumeToGain(volume: number): number {
  if (volume <= 0) return 0;
  // Curva perceptiva leve: 50% no slider ≈ metade do volume percebido.
  return (clampVolume(volume) / 100) ** 1.25;
}

function applyMasterGain(volume: number): void {
  if (!masterGain || !audioContext) return;
  const gain = volumeToGain(volume);
  try {
    masterGain.gain.setTargetAtTime(gain, audioContext.currentTime, 0.02);
  } catch {
    masterGain.gain.value = gain;
  }
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const view = window as WebkitWindow;
  return window.AudioContext ?? view.webkitAudioContext ?? null;
}

function ensureAudioGraph(): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new Ctor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = volumeToGain(hydratePrefs().volume);
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

function buildFallbackBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 0.55;
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  const envelope = (t: number, start: number, len: number) => {
    const x = t - start;
    if (x < 0 || x > len) return 0;
    const attack = 0.012;
    if (x < attack) return x / attack;
    return Math.exp((-5.2 * (x - attack)) / Math.max(0.0001, len - attack));
  };

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / ctx.sampleRate;
    const first = Math.sin(2 * Math.PI * 1318.5 * t) * envelope(t, 0, 0.34);
    const second = Math.sin(2 * Math.PI * 1760 * t) * envelope(t, 0.16, 0.42);
    data[i] = (first * 0.55 + second * 0.62) * 0.9;
  }

  return buffer;
}

async function decodeSrcToBuffer(
  ctx: AudioContext,
  src: string
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(src, { cache: "no-store" });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch (error) {
    console.error("notification sound: falha ao decodificar", src, error);
    return null;
  }
}

async function loadAudioBuffer(
  ctx: AudioContext,
  src: string
): Promise<AudioBuffer | null> {
  if (audioBuffer && cachedSoundSrc === src) return audioBuffer;
  if (loadPromise && cachedSoundSrc === src) return loadPromise;

  cachedSoundSrc = src;
  audioBuffer = null;

  loadPromise = (async () => {
    try {
      let buffer = await decodeSrcToBuffer(ctx, src);
      if (!buffer && src !== SOUND_SRC) {
        buffer = await decodeSrcToBuffer(ctx, SOUND_SRC);
      }
      if (!buffer) {
        buffer = buildFallbackBuffer(ctx);
      }
      audioBuffer = buffer;
      return buffer;
    } catch (error) {
      console.error("notification sound: falha ao carregar áudio", error);
      try {
        audioBuffer = buildFallbackBuffer(ctx);
        return audioBuffer;
      } catch (fallbackError) {
        console.error(
          "notification sound: falha no fallback sintetizado",
          fallbackError
        );
        return null;
      }
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

async function resumeContext(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "running") return true;
  try {
    await ctx.resume();
    return String(ctx.state) === "running";
  } catch (error) {
    console.error("notification sound: não foi possível retomar o AudioContext", error);
    return false;
  }
}

function startBufferSource(
  ctx: AudioContext,
  buffer: AudioBuffer,
  when = 0
): void {
  if (!masterGain) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);

  const disconnect = () => {
    try {
      source.disconnect();
    } catch {
      // Nó já desconectado.
    }
  };

  source.onended = disconnect;

  try {
    source.start(Math.max(ctx.currentTime, when));
  } catch (error) {
    disconnect();
    console.error("notification sound: falha ao iniciar o buffer", error);
  }
}

function hydrateAnnouncedIds(): void {
  if (announcedHydrated || typeof window === "undefined") return;
  announcedHydrated = true;
  try {
    const raw = window.localStorage.getItem(ANNOUNCED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      if (typeof id === "string" && id.length > 0) {
        announcedOrderIds.add(id);
      }
    }
  } catch {
    // Storage corrompido: seguimos só com o Set em memória.
  }
}

function persistAnnouncedIds(): void {
  if (typeof window === "undefined") return;
  try {
    const ids = [...announcedOrderIds];
    const trimmed =
      ids.length > MAX_ANNOUNCED_IDS
        ? ids.slice(ids.length - MAX_ANNOUNCED_IDS)
        : ids;
    if (trimmed.length !== ids.length) {
      announcedOrderIds.clear();
      for (const id of trimmed) announcedOrderIds.add(id);
    }
    window.localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage indisponível: dedupe continua em memória nesta sessão.
  }
}

function collectNewOrderIds(ids: string[]): string[] {
  hydrateAnnouncedIds();
  const newcomers: string[] = [];
  for (const id of ids) {
    if (!id || announcedOrderIds.has(id)) continue;
    announcedOrderIds.add(id);
    newcomers.push(id);
  }
  if (newcomers.length > 0) persistAnnouncedIds();
  return newcomers;
}

async function playLoadedSound(delaySeconds = 0): Promise<void> {
  if (!storeSoundEnabledFlag) return;

  const prefs = hydratePrefs();
  if (!prefs.enabled || prefs.volume <= 0) return;

  const ctx = ensureAudioGraph();
  if (!ctx) return;

  const running = await resumeContext(ctx);
  if (!running) return;

  const buffer = await loadAudioBuffer(ctx, currentSoundSrc());
  if (!buffer) return;

  startBufferSource(ctx, buffer, ctx.currentTime + Math.max(0, delaySeconds));
}

export type NotificationSoundOptions = {
  /** Política da loja (Configurações). false = nunca reproduz na recepção. */
  storeEnabled?: boolean;
  /** MP3 personalizado (`/api/file?pathname=...`). Null = alerta padrão. */
  customSoundUrl?: string | null;
};

/**
 * Hook de alerta sonoro da recepção.
 *
 * O AudioContext e o buffer ficam no módulo para sobreviver ao remount
 * do React Strict Mode. Deduplicação é por `order.id` (Set + localStorage).
 */
export function useNotificationSound(
  options: NotificationSoundOptions = {}
) {
  const enabled = useSyncExternalStore(
    subscribePrefs,
    () => getPrefsSnapshot().enabled,
    getEnabledServerSnapshot
  );
  const volume = useSyncExternalStore(
    subscribePrefs,
    () => getPrefsSnapshot().volume,
    getVolumeServerSnapshot
  );

  const storeEnabled = options.storeEnabled ?? true;
  const customUrl = sanitizeNotificationSoundSrc(
    options.customSoundUrl ?? null
  );

  useEffect(() => {
    storeSoundEnabledFlag = storeEnabled;
    const nextSrc = customUrl ?? SOUND_SRC;
    if (configuredSoundSrc !== nextSrc) {
      audioBuffer = null;
      loadPromise = null;
      cachedSoundSrc = null;
      configuredSoundSrc = nextSrc;
    }
  }, [storeEnabled, customUrl]);

  const unlockAudio = useCallback(async (): Promise<boolean> => {
    try {
      const ctx = ensureAudioGraph();
      if (!ctx) return false;
      const running = await resumeContext(ctx);
      if (!running) return false;
      await loadAudioBuffer(ctx, currentSoundSrc());
      return true;
    } catch (error) {
      console.error("notification sound: falha ao desbloquear áudio", error);
      return false;
    }
  }, []);

  const enableSound = useCallback(async (): Promise<boolean> => {
    persistPrefs({ ...hydratePrefs(), enabled: true });
    try {
      return await unlockAudio();
    } catch (error) {
      console.error("notification sound: falha ao ativar", error);
      return false;
    }
  }, [unlockAudio]);

  const disableSound = useCallback(() => {
    persistPrefs({ ...hydratePrefs(), enabled: false });
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    persistPrefs({ ...hydratePrefs(), volume: clampVolume(nextVolume) });
  }, []);

  const playNotification = useCallback(async (): Promise<void> => {
    try {
      await playLoadedSound();
    } catch (error) {
      console.error("notification sound: falha na reprodução", error);
    }
  }, []);

  const testSound = useCallback(async (): Promise<void> => {
    try {
      const unlocked = await unlockAudio();
      if (!unlocked) return;
      const previous = hydratePrefs();
      if (!previous.enabled) {
        persistPrefs({ ...previous, enabled: true });
      }
      await playLoadedSound();
    } catch (error) {
      console.error("notification sound: falha no teste", error);
    }
  }, [unlockAudio]);

  /**
   * Marca IDs como já vistos, sem tocar som.
   * Usado no primeiro snapshot da recepção (pedidos que já estavam na fila).
   */
  const acknowledgeOrders = useCallback((orderIds: string[]) => {
    collectNewOrderIds(orderIds);
  }, []);

  /**
   * Um toque por lote de pedidos novos. IDs repetidos (polling, Strict Mode,
   * remontagem) são ignorados.
   */
  const notifyNewOrders = useCallback((orderIds: string[]) => {
    const newcomers = collectNewOrderIds(orderIds);
    if (newcomers.length === 0) return;

    void playLoadedSound().catch((error) => {
      console.error("notification sound: falha na reprodução", error);
    });
  }, []);

  useEffect(() => {
    hydratePrefs();
    hydrateAnnouncedIds();
    applyMasterGain(hydratePrefs().volume);
  }, []);

  return {
    isEnabled: enabled,
    volume,
    enableSound,
    disableSound,
    setVolume,
    playNotification,
    testSound,
    unlockAudio,
    acknowledgeOrders,
    notifyNewOrders,
  };
}
