-- AlterTable: imageUrl opcional — brindes existentes ficam com NULL (fallback de ícone).
ALTER TABLE "Gift" ADD COLUMN "imageUrl" TEXT;
