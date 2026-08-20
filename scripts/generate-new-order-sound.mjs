/**
 * Gera um chime curto (WAV PCM 16-bit) para alerta de novo pedido.
 * Uso: node scripts/generate-new-order-sound.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44100;
const DURATION_S = 0.62;

function envelope(t, duration, attack = 0.012) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  const remain = Math.max(0.0001, duration - attack);
  return Math.exp((-5.2 * (t - attack)) / remain);
}

function sampleAt(t) {
  // Dois toques: E6 (~1318 Hz) e A6 (1760 Hz), com harmônico suave.
  const first = Math.sin(2 * Math.PI * 1318.5 * t) * envelope(t, 0.34);
  const firstHarm = Math.sin(2 * Math.PI * 2637 * t) * envelope(t, 0.22) * 0.18;
  const secondStart = 0.16;
  const t2 = t - secondStart;
  const second = Math.sin(2 * Math.PI * 1760 * t2) * envelope(t2, 0.42);
  const secondHarm = Math.sin(2 * Math.PI * 3520 * t2) * envelope(t2, 0.28) * 0.14;
  return first * 0.55 + firstHarm + second * 0.62 + secondHarm;
}

const frameCount = Math.floor(SAMPLE_RATE * DURATION_S);
const pcm = Buffer.alloc(frameCount * 2);

for (let i = 0; i < frameCount; i += 1) {
  const t = i / SAMPLE_RATE;
  const clamped = Math.max(-1, Math.min(1, sampleAt(t) * 0.92));
  pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "new-order.wav");
writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${outPath} (${(44 + pcm.length) / 1024} KB)`);
