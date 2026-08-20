import assert from "node:assert/strict";
import { test } from "node:test";

import { sniffImageContentType } from "@/lib/images";
import {
  extractBlobPathnameFromFileUrl,
  isAllowedNotificationSoundUrl,
  safeMp3BlobPath,
  sanitizeDisplayFileName,
  sanitizeNotificationSoundSrc,
  sniffMp3ContentType,
} from "@/lib/audio/mp3";

function mpegLayerIiiHeader(): Uint8Array {
  // MPEG-1 Layer III, 44.1 kHz, 128 kbps (frame sync 0xFF 0xFB)
  return new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
}

test("sniffMp3ContentType aceita frame MPEG Layer III no início", () => {
  assert.equal(sniffMp3ContentType(mpegLayerIiiHeader()), "audio/mpeg");
});

test("sniffMp3ContentType aceita ID3v2 seguido de frame MPEG", () => {
  const frame = mpegLayerIiiHeader();
  const bytes = new Uint8Array(10 + frame.length);
  bytes[0] = 0x49;
  bytes[1] = 0x44;
  bytes[2] = 0x33;
  bytes[3] = 0x03;
  bytes.set(frame, 10);
  assert.equal(sniffMp3ContentType(bytes), "audio/mpeg");
});

test("sniffMp3ContentType rejeita JPEG", () => {
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  assert.equal(sniffMp3ContentType(jpeg), null);
  assert.equal(sniffImageContentType(jpeg), "image/jpeg");
});

test("sniffMp3ContentType rejeita buffer vazio e texto", () => {
  assert.equal(sniffMp3ContentType(new Uint8Array()), null);
  assert.equal(sniffMp3ContentType(new TextEncoder().encode("hello")), null);
});

test("isAllowedNotificationSoundUrl só aceita proxy interno .mp3", () => {
  assert.equal(
    isAllowedNotificationSoundUrl(
      "/api/file?pathname=notification-sounds/campainha-abc.mp3"
    ),
    true
  );
  assert.equal(
    isAllowedNotificationSoundUrl("/api/file?pathname=produtos/foto.jpg"),
    false
  );
  assert.equal(
    isAllowedNotificationSoundUrl("https://evil.example/audio.mp3"),
    false
  );
  assert.equal(
    isAllowedNotificationSoundUrl("/api/file?pathname=../etc/passwd.mp3"),
    false
  );
});

test("sanitizeNotificationSoundSrc descarta valores inválidos", () => {
  assert.equal(sanitizeNotificationSoundSrc(null), null);
  assert.equal(sanitizeNotificationSoundSrc("  "), null);
  assert.equal(
    sanitizeNotificationSoundSrc(
      "/api/file?pathname=notification-sounds/a.mp3"
    ),
    "/api/file?pathname=notification-sounds/a.mp3"
  );
});

test("extractBlobPathnameFromFileUrl e nomes seguros", () => {
  assert.equal(
    extractBlobPathnameFromFileUrl(
      "/api/file?pathname=notification-sounds/foo.mp3"
    ),
    "notification-sounds/foo.mp3"
  );
  assert.equal(safeMp3BlobPath("../../etc/passwd.mp3"), "notification-sounds/passwd.mp3");
  assert.equal(
    sanitizeDisplayFileName("Meu Som!.mp3"),
    "Meu Som!.mp3"
  );
  assert.match(sanitizeDisplayFileName("a/b\\c.mp3"), /c\.mp3$/);
});
