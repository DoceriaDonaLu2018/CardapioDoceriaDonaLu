import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canReleaseOrderToKitchen } from "./kitchen";

const paidAt = new Date("2026-08-19T20:00:00.000Z");

describe("canReleaseOrderToKitchen — fail closed", () => {
  it("pedido online recém-criado (AWAITING_PAYMENT) NÃO entra", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "AWAITING_PAYMENT",
        paymentId: null,
        paidAt: null,
        releasedToKitchen: false,
      }),
      false
    );
  });

  it("PIX gerado / pendente / agendado NÃO entra (flag false + AWAITING)", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "AWAITING_PAYMENT",
        paymentId: null,
        paidAt: null,
        releasedToKitchen: false,
      }),
      false
    );
  });

  it("flag true sozinha NÃO libera pedido online sem pagamento", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "AWAITING_PAYMENT",
        paymentId: "123",
        paidAt,
        releasedToKitchen: true,
      }),
      false
    );
  });

  it("PAID sem paymentId NÃO entra (defesa em profundidade)", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "PAID",
        paymentId: null,
        paidAt,
        releasedToKitchen: true,
      }),
      false
    );
  });

  it("PAID sem paidAt NÃO entra", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "PAID",
        paymentId: "123",
        paidAt: null,
        releasedToKitchen: true,
      }),
      false
    );
  });

  it("PAID sem releasedToKitchen NÃO entra", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "PAID",
        paymentId: "123",
        paidAt,
        releasedToKitchen: false,
      }),
      false
    );
  });

  it("pedido online pago e confirmado ENTRA", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "ONLINE",
        status: "PAID",
        paymentId: "987654321",
        paidAt,
        releasedToKitchen: true,
      }),
      true
    );
  });

  it("PDV PENDING com flag ENTRA (pagamento no balcão)", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "PDV",
        status: "PENDING",
        paymentId: null,
        paidAt: null,
        releasedToKitchen: true,
      }),
      true
    );
  });

  it("PDV sem flag NÃO entra", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "PDV",
        status: "PENDING",
        releasedToKitchen: false,
      }),
      false
    );
  });

  it("rejeitado / cancelado / expirado / requires_refund NÃO entram", () => {
    for (const status of [
      "CANCELED",
      "REQUIRES_REFUND",
      "COMPLETED",
      "AWAITING_PAYMENT",
    ]) {
      assert.equal(
        canReleaseOrderToKitchen({
          source: "ONLINE",
          status,
          paymentId: "1",
          paidAt,
          releasedToKitchen: true,
        }),
        false
      );
    }
  });

  it("origem desconhecida NÃO entra (fail closed)", () => {
    assert.equal(
      canReleaseOrderToKitchen({
        source: "HACKED",
        status: "PAID",
        paymentId: "1",
        paidAt,
        releasedToKitchen: true,
      }),
      false
    );
  });
});
