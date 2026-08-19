-- Pagamentos PIX transparentes (Checkout API).
-- Checkout Pro permanece em Order.paymentId; esta tabela NÃO é usada por preferências.
-- Compatível com produção: só CREATE TABLE + índices. Nenhuma coluna existente é alterada.

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusDetail" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "externalReference" TEXT NOT NULL,
    "qrCode" TEXT,
    "qrCodeBase64" TEXT,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");

CREATE INDEX "payments_orderId_createdAt_idx" ON "payments"("orderId", "createdAt");

CREATE INDEX "payments_orderId_status_idx" ON "payments"("orderId", "status");

-- No máximo um PIX pendente por pedido (novas tentativas exigem expirar/cancelar o anterior).
CREATE UNIQUE INDEX "payments_one_pending_pix_per_order"
ON "payments" ("orderId")
WHERE "method" = 'pix' AND "status" = 'pending';

ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
