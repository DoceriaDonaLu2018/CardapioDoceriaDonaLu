-- Sessão persistida da recepção (abrir/encerrar loja-cozinha).
-- Aditivo: nenhuma coluna existente é removida.

ALTER TABLE "store_settings" ADD COLUMN "receptionOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "store_settings" ADD COLUMN "receptionOpenedOnDate" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "receptionClosedReason" TEXT;
