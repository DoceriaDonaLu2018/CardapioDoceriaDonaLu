import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MERCADOPAGO_IDEMPOTENCY_KEY_MAX,
  PIX_USER_ERROR,
  buildPixIdempotencyKey,
  buildPixPaymentBody,
  formatMercadoPagoExpiration,
  getMercadoPagoTokenFingerprint,
  mapMercadoPagoError,
  pixUserMessageFromGateway,
} from "./mercadopago";

describe("formatMercadoPagoExpiration", () => {
  it("usa offset -03:00 e não o sufixo Z", () => {
    const utc = new Date("2026-08-19T23:00:00.000Z");
    const formatted = formatMercadoPagoExpiration(utc);
    assert.equal(formatted, "2026-08-19T20:00:00.000-03:00");
    assert.equal(formatted.includes("Z"), false);
    assert.match(formatted, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000-03:00$/);
  });
});

describe("buildPixIdempotencyKey", () => {
  it("fica dentro do limite de 64 caracteres e varia por tentativa", () => {
    const longOrderId = "clxxxxxxxxxxxxxxxxxx12345";
    const a = buildPixIdempotencyKey(longOrderId);
    const b = buildPixIdempotencyKey(longOrderId);
    assert.ok(a.length <= MERCADOPAGO_IDEMPOTENCY_KEY_MAX);
    assert.ok(b.length <= MERCADOPAGO_IDEMPOTENCY_KEY_MAX);
    assert.notEqual(a, b);
    assert.match(a, /^pix[a-zA-Z0-9]+$/);
  });
});

describe("buildPixPaymentBody", () => {
  it("alinha o payload PIX à documentação e omite statement_descriptor", () => {
    const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://cardapiodoceriadonalu.vercel.app";
    try {
      const body = buildPixPaymentBody({
        orderId: "clorder1234567890",
        amount: 100.129,
        description: "Pedido Dona Lu #ABC",
        payerEmail: "  Cliente@Email.COM ",
        payerFirstName: "Maria",
        payerLastName: "Silva",
        cpf: "191.191.191-00",
        idempotencyKey: "ignored",
        expiresAt: new Date("2026-08-19T23:00:00.000Z"),
      });

      assert.equal(body.payment_method_id, "pix");
      assert.equal(body.transaction_amount, 100.13);
      assert.equal(body.external_reference, "clorder1234567890");
      assert.equal(body.date_of_expiration, "2026-08-19T20:00:00.000-03:00");
      assert.equal(body.payer.email, "cliente@email.com");
      assert.deepEqual(body.payer.identification, {
        type: "CPF",
        number: "19119119100",
      });
      assert.equal(
        body.notification_url,
        "https://cardapiodoceriadonalu.vercel.app/api/webhooks/mercadopago?source_news=webhooks"
      );
      assert.equal("statement_descriptor" in body, false);
    } finally {
      if (previousUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = previousUrl;
      }
    }
  });
});

describe("mapMercadoPagoError — Financial Identity", () => {
  it("não reencaminha o erro interno do Mercado Pago ao cliente", () => {
    assert.equal(
      mapMercadoPagoError("Error in Financial Identity Use Case"),
      PIX_USER_ERROR
    );
    assert.equal(
      pixUserMessageFromGateway("Error in Financial Identity Use Case"),
      PIX_USER_ERROR
    );
    assert.equal(
      pixUserMessageFromGateway("some unknown gateway failure"),
      PIX_USER_ERROR
    );
    assert.match(
      mapMercadoPagoError("Collector user without key enabled for QR render"),
      /chave PIX/i
    );
  });
});

describe("getMercadoPagoTokenFingerprint", () => {
  it("nunca inclui o token, só prefixo e tamanho", () => {
    const previous = process.env.MERCADOPAGO_ACCESS_TOKEN;
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-super-secret-value";
    try {
      const fingerprint = getMercadoPagoTokenFingerprint();
      assert.equal(fingerprint.tokenConfigured, true);
      assert.equal(fingerprint.tokenPrefix, "APP_USR-****");
      assert.equal(fingerprint.environment, "production");
      assert.equal(fingerprint.tokenLength, "APP_USR-super-secret-value".length);
      assert.equal(JSON.stringify(fingerprint).includes("super-secret"), false);
    } finally {
      if (previous === undefined) {
        delete process.env.MERCADOPAGO_ACCESS_TOKEN;
      } else {
        process.env.MERCADOPAGO_ACCESS_TOKEN = previous;
      }
    }
  });
});
