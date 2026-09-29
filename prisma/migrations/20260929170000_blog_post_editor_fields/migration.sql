ALTER TABLE "blog_posts"
ADD COLUMN "steps" JSONB,
ADD COLUMN "materials" JSONB,
ADD COLUMN "estimated_time_minutes" INTEGER,
ADD COLUMN "difficulty" TEXT,
ADD COLUMN "focus_keyword" TEXT,
ADD COLUMN "social_share_image" TEXT,
ADD COLUMN "social_share_image_alt" TEXT,
ADD COLUMN "twitter_card" "TwitterCardType" NOT NULL DEFAULT 'SUMMARY_LARGE_IMAGE',
ADD COLUMN "content_blocks" JSONB;