import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  parseMercadoPagoResourceId,
  verifyMercadoPagoWebhookSignature,
} from "./mercadopago";

const SECRET = "webhook-test-secret";

function sign(params: {
  dataId: string;
  requestId: string;
  ts: string;
}): string {
  let manifest = "";
  if (params.dataId) manifest += `id:${params.dataId.toLowerCase()};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${params.ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${params.ts},v1=${v1}`;
}

describe("parseMercadoPagoResourceId", () => {
  it("aceita IDs numéricos e rejeita path traversal / lixo", () => {
    assert.equal(parseMercadoPagoResourceId("123456789"), "123456789");
    assert.equal(parseMercadoPagoResourceId("1/../users/me"), null);
    assert.equal(parseMercadoPagoResourceId("abc"), null);
    assert.equal(parseMercadoPagoResourceId(""), null);
  });
});

describe("verifyMercadoPagoWebhookSignature", () => {
  it("aceita assinatura válida dentro da janela de tempo", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    const ts = String(Date.now());
    const xSignature = sign({
      dataId: "987654321",
      requestId: "req-1",
      ts,
    });
    assert.equal(
      verifyMercadoPagoWebhookSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "987654321",
      }),
      true
    );
  });

  it("rejeita assinatura adulterada", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    const ts = String(Date.now());
    const xSignature = sign({
      dataId: "987654321",
      requestId: "req-1",
      ts,
    });
    assert.equal(
      verifyMercadoPagoWebhookSignature({
        xSignature: xSignature.replace("v1=", "v1=dead"),
        xRequestId: "req-1",
        dataId: "987654321",
      }),
      false
    );
  });

  it("rejeita payload sem assinatura", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    assert.equal(
      verifyMercadoPagoWebhookSignature({
        xSignature: null,
        xRequestId: "req-1",
        dataId: "1",
      }),
      false
    );
  });
});
