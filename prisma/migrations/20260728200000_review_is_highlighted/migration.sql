-- AlterTable
ALTER TABLE "Review" ADD COLUMN "isHighlighted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Review_isVisible_isHighlighted_idx" ON "Review"("isVisible", "isHighlighted");
