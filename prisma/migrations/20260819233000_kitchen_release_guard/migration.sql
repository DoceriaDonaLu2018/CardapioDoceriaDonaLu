-- Liberação explícita para cozinha + log de auditoria financeira.
-- Aditivo: nenhuma coluna existente é removida ou reescrita de forma destrutiva.

ALTER TABLE "orders" ADD COLUMN "releasedToKitchen" BOOLEAN NOT NULL DEFAULT false;

-- Backfill produção: PDV já visível na cozinha / já concluído no balcão.
UPDATE "orders"
SET "releasedToKitchen" = true
WHERE "source" = 'PDV'
  AND "status" IN ('PENDING', 'COMPLETED');

-- Backfill produção: online só se já houve confirmação financeira persistida.
UPDATE "orders"
SET "releasedToKitchen" = true
WHERE "source" = 'ONLINE'
  AND "status" IN ('PAID', 'COMPLETED')
  AND "paymentId" IS NOT NULL
  AND "paidAt" IS NOT NULL;

CREATE INDEX "orders_releasedToKitchen_status_source_idx"
ON "orders" ("releasedToKitchen", "status", "source");

CREATE TABLE "payment_audit_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "event" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_audit_logs_orderId_createdAt_idx"
ON "payment_audit_logs" ("orderId", "createdAt");

CREATE INDEX "payment_audit_logs_paymentId_idx"
ON "payment_audit_logs" ("paymentId");

CREATE INDEX "payment_audit_logs_event_createdAt_idx"
ON "payment_audit_logs" ("event", "createdAt");
