import assert from "node:assert/strict";
import { test } from "node:test";

import { STORE_SETTINGS_DEFAULTS, type StoreSettingsData } from "@/lib/store-settings";
import { computeReceptionSnapshot } from "@/lib/reception";
import {
  evaluateStoreStatus,
  isWithinHours,
  timeToMinutes,
} from "@/lib/store-status";

/** Brasília = UTC-3 o ano todo. */
function atBrasilia(wall: string): Date {
  return new Date(`${wall}-03:00`);
}

const hours = { closed: false, open: "08:00", close: "18:00" };

test("isWithinHours: 17:59 aberto, 18:00 fechado", () => {
  assert.equal(isWithinHours(hours, timeToMinutes("17:59")), true);
  assert.equal(isWithinHours(hours, timeToMinutes("18:00")), false);
  assert.equal(isWithinHours(hours, timeToMinutes("08:00")), true);
  assert.equal(isWithinHours(hours, timeToMinutes("07:59")), false);
});

test("isWithinHours: faixa que cruza meia-noite", () => {
  const overnight = { closed: false, open: "22:00", close: "02:00" };
  assert.equal(isWithinHours(overnight, timeToMinutes("22:00")), true);
  assert.equal(isWithinHours(overnight, timeToMinutes("23:59")), true);
  assert.equal(isWithinHours(overnight, timeToMinutes("01:59")), true);
  assert.equal(isWithinHours(overnight, timeToMinutes("02:00")), false);
  assert.equal(isWithinHours(overnight, timeToMinutes("12:00")), false);
});

test("isWithinHours: dia fechado", () => {
  assert.equal(
    isWithinHours({ closed: true, open: "08:00", close: "18:00" }, timeToMinutes("12:00")),
    false
  );
});

function settings(overrides: Partial<StoreSettingsData> = {}): StoreSettingsData {
  return {
    ...STORE_SETTINGS_DEFAULTS,
    openTime: "08:00",
    closeTime: "18:00",
    ...overrides,
  };
}

test("recepção aberta no mesmo dia e dentro do horário", () => {
  const now = atBrasilia("2026-08-20T14:30:00");
  const snap = computeReceptionSnapshot(
    settings({
      receptionOpen: true,
      receptionOpenedOnDate: "2026-08-20",
      receptionClosedReason: null,
    }),
    now
  );
  assert.equal(snap.isOpen, true);
  assert.equal(snap.canOpen, true);
  assert.equal(snap.closeTime, "18:00");
});

test("recepção do dia anterior não permanece aberta", () => {
  const now = atBrasilia("2026-08-21T10:00:00");
  const snap = computeReceptionSnapshot(
    settings({
      receptionOpen: true,
      receptionOpenedOnDate: "2026-08-20",
      receptionClosedReason: null,
    }),
    now
  );
  assert.equal(snap.isOpen, false);
  assert.equal(snap.canOpen, true);
});

test("fechamento manual no mesmo dia bloqueia checkout de retirada", () => {
  const now = atBrasilia("2026-08-20T14:30:00");
  const s = settings({
    receptionOpen: false,
    receptionOpenedOnDate: "2026-08-20",
    receptionClosedReason: "MANUAL",
  });
  const status = evaluateStoreStatus(s, { now, fulfillmentMode: "pickup" });
  assert.equal(status.isOpen, false);
  assert.equal(status.canCheckoutPickup, false);
  assert.equal(status.canCheckoutScheduled, true);
});

test("sem sessão de recepção, checkout segue só o horário", () => {
  const now = atBrasilia("2026-08-20T14:30:00");
  const status = evaluateStoreStatus(settings(), {
    now,
    fulfillmentMode: "pickup",
  });
  assert.equal(status.isOpen, true);
  assert.equal(status.canCheckoutPickup, true);
});

test("às 18:00 a loja está fechada para retirada", () => {
  const now = atBrasilia("2026-08-20T18:00:00");
  const status = evaluateStoreStatus(settings(), {
    now,
    fulfillmentMode: "pickup",
  });
  assert.equal(status.isOpen, false);
  assert.equal(status.canCheckoutPickup, false);
});

test("às 17:59 a loja permanece aberta", () => {
  const now = atBrasilia("2026-08-20T17:59:00");
  const status = evaluateStoreStatus(settings(), {
    now,
    fulfillmentMode: "pickup",
  });
  assert.equal(status.isOpen, true);
});

test("sessão persistida às 18:00 já conta como recepção fechada", () => {
  const now = atBrasilia("2026-08-20T18:00:00");
  const snap = computeReceptionSnapshot(
    settings({
      receptionOpen: true,
      receptionOpenedOnDate: "2026-08-20",
      receptionClosedReason: null,
    }),
    now
  );
  assert.equal(snap.isOpen, false);
  assert.equal(snap.canOpen, false);
});

test("fechamento manual de ontem não impede abertura hoje", () => {
  const now = atBrasilia("2026-08-21T10:00:00");
  const snap = computeReceptionSnapshot(
    settings({
      receptionOpen: false,
      receptionOpenedOnDate: "2026-08-20",
      receptionClosedReason: "MANUAL",
    }),
    now
  );
  assert.equal(snap.isOpen, false);
  assert.equal(snap.canOpen, true);
  assert.equal(snap.closedReason, null);
});
