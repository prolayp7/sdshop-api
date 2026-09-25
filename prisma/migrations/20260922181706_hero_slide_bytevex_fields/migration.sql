-- AlterTable
ALTER TABLE "hero_slides" ADD COLUMN     "badge_label" TEXT,
ADD COLUMN     "headline_highlight" TEXT,
ADD COLUMN     "metrics" JSONB,
ADD COLUMN     "product_name" TEXT,
ADD COLUMN     "product_subline" TEXT,
ADD COLUMN     "showcase_label" TEXT,
ADD COLUMN     "specs" JSONB,
ADD COLUMN     "visual_capacity" TEXT,
ADD COLUMN     "visual_companion_capacity" TEXT,
ADD COLUMN     "visual_companion_kind" TEXT,
ADD COLUMN     "visual_kind" TEXT,
ADD COLUMN     "visual_rating" TEXT;
