-- Som de notificação personalizado (MP3) nas configurações da loja.
-- Aditivo: nenhuma coluna existente é removida.

ALTER TABLE "store_settings" ADD COLUMN "notificationSoundEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "store_settings" ADD COLUMN "notificationSoundUrl" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "notificationSoundName" TEXT;
ALTER TABLE "store_settings" ADD COLUMN "notificationSoundSize" INTEGER;
ALTER TABLE "store_settings" ADD COLUMN "notificationSoundUpdatedAt" TIMESTAMP(3);
