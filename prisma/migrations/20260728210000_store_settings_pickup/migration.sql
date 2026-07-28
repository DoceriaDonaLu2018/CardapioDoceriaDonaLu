-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickupTime" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryDate" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "store_settings" (
    "id" TEXT NOT NULL,
    "openTime" TEXT NOT NULL DEFAULT '12:00',
    "closeTime" TEXT NOT NULL DEFAULT '18:00',
    "pickupSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- Seed defaults (idempotente)
INSERT INTO "store_settings" ("id", "openTime", "closeTime", "pickupSlots", "updatedAt", "createdAt")
VALUES (
  'default',
  '12:00',
  '18:00',
  ARRAY['12:00','13:00','14:00','15:00','16:00','17:00','18:00']::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
