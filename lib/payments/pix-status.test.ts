import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPixExpired,
  isPixReusable,
  isTerminalMercadoPagoStatus,
  mapMercadoPagoStatusToPix,
  PixPaymentStatus,
  splitPayerName,
} from "./pix-status";

describe("mapMercadoPagoStatusToPix", () => {
  it("mapeia approved, pending e terminais", () => {
    assert.equal(mapMercadoPagoStatusToPix("approved"), PixPaymentStatus.APPROVED);
    assert.equal(mapMercadoPagoStatusToPix("pending"), PixPaymentStatus.PENDING);
    assert.equal(mapMercadoPagoStatusToPix("in_process"), PixPaymentStatus.PENDING);
    assert.equal(mapMercadoPagoStatusToPix("rejected"), PixPaymentStatus.REJECTED);
    assert.equal(mapMercadoPagoStatusToPix("cancelled"), PixPaymentStatus.CANCELLED);
    assert.equal(mapMercadoPagoStatusToPix("canceled"), PixPaymentStatus.CANCELLED);
    assert.equal(mapMercadoPagoStatusToPix("refunded"), PixPaymentStatus.REFUNDED);
    assert.equal(mapMercadoPagoStatusToPix("charged_back"), PixPaymentStatus.REFUNDED);
  });
});

describe("política de expiração PIX", () => {
  it("não trata PIX sem expiresAt como expirado", () => {
    assert.equal(isPixExpired(null), false);
  });

  it("expira somente após expiresAt", () => {
    const now = Date.parse("2026-08-19T20:00:00.000Z");
    assert.equal(isPixExpired(new Date("2026-08-19T20:00:01.000Z"), now), false);
    assert.equal(isPixExpired(new Date("2026-08-19T19:59:59.000Z"), now), true);
  });

  it("só reutiliza PIX pending não expirado", () => {
    const now = Date.parse("2026-08-19T20:00:00.000Z");
    assert.equal(
      isPixReusable({
        status: "pending",
        expiresAt: new Date("2026-08-19T20:10:00.000Z"),
        nowMs: now,
      }),
      true
    );
    assert.equal(
      isPixReusable({
        status: "pending",
        expiresAt: new Date("2026-08-19T19:00:00.000Z"),
        nowMs: now,
      }),
      false
    );
    assert.equal(
      isPixReusable({
        status: "approved",
        expiresAt: new Date("2026-08-19T20:10:00.000Z"),
        nowMs: now,
      }),
      false
    );
    assert.equal(
      isPixReusable({
        status: "expired",
        expiresAt: new Date("2026-08-19T20:10:00.000Z"),
        nowMs: now,
      }),
      false
    );
  });

  it("nunca promove approved para pending via mapeamento", () => {
    assert.notEqual(mapMercadoPagoStatusToPix("approved"), PixPaymentStatus.PENDING);
    assert.equal(isTerminalMercadoPagoStatus("rejected"), true);
    assert.equal(isTerminalMercadoPagoStatus("pending"), false);
  });
});

describe("splitPayerName", () => {
  it("separa nome e sobrenome com fallback seguro", () => {
    assert.deepEqual(splitPayerName("Maria Silva"), {
      firstName: "Maria",
      lastName: "Silva",
    });
    assert.deepEqual(splitPayerName("Lu"), {
      firstName: "Lu",
      lastName: "Lu",
    });
  });
});
