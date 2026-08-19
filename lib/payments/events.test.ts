import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PaymentLogEvent } from "./events";

describe("PaymentLogEvent", () => {
  it("expõe os eventos de observabilidade do fluxo PIX/webhook/cozinha", () => {
    assert.equal(PaymentLogEvent.PIX_CREATE_STARTED, "PIX_CREATE_STARTED");
    assert.equal(PaymentLogEvent.PIX_CREATE_SUCCESS, "PIX_CREATE_SUCCESS");
    assert.equal(PaymentLogEvent.PIX_CREATE_FAILED, "PIX_CREATE_FAILED");
    assert.equal(PaymentLogEvent.PAYMENT_WEBHOOK_RECEIVED, "PAYMENT_WEBHOOK_RECEIVED");
    assert.equal(PaymentLogEvent.PAYMENT_WEBHOOK_VALIDATED, "PAYMENT_WEBHOOK_VALIDATED");
    assert.equal(PaymentLogEvent.PAYMENT_WEBHOOK_REJECTED, "PAYMENT_WEBHOOK_REJECTED");
    assert.equal(PaymentLogEvent.PAYMENT_FETCHED, "PAYMENT_FETCHED");
    assert.equal(PaymentLogEvent.PAYMENT_VALIDATED, "PAYMENT_VALIDATED");
    assert.equal(PaymentLogEvent.PAYMENT_APPROVED, "PAYMENT_APPROVED");
    assert.equal(PaymentLogEvent.ORDER_PAYMENT_CONFIRMED, "ORDER_PAYMENT_CONFIRMED");
    assert.equal(PaymentLogEvent.ORDER_RELEASED_TO_KITCHEN, "ORDER_RELEASED_TO_KITCHEN");
  });
});
