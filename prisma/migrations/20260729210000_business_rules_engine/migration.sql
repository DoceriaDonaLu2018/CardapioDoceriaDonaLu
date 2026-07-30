-- AlterTable Banner
ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Banner" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Banner_startDate_endDate_idx" ON "Banner"("startDate", "endDate");

-- AlterTable StoreSettings
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "minOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "advanceNoticeDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "allowedPreOrderDays" INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6]::INTEGER[];
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "operatingHours" JSONB;

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "giftName" TEXT;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable Coupon
CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "minPurchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX IF NOT EXISTS "Coupon_isActive_expiresAt_idx" ON "Coupon"("isActive", "expiresAt");

-- CreateTable Gift
CREATE TABLE IF NOT EXISTS "Gift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPurchaseValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Gift_isActive_minPurchaseValue_idx" ON "Gift"("isActive", "minPurchaseValue");
