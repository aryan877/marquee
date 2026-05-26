[dotenv@17.2.3] injecting env (18) from ../../.env -- tip: 📡 add observability to secrets: https://dotenvx.com/ops
Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWITTER', 'LINKEDIN', 'FACEBOOK', 'YOUTUBE', 'BLUESKY', 'THREADS', 'PINTEREST', 'GOOGLE_BUSINESS');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POSTER', 'VIDEO', 'CAROUSEL', 'REEL');

-- CreateEnum
CREATE TYPE "ContentJobStatus" AS ENUM ('PENDING', 'GENERATING', 'RENDERING', 'REVIEW', 'POSTING', 'POSTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "avatar_url" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "posts_used_period" INTEGER NOT NULL DEFAULT 0,
    "period_ends_at" TIMESTAMPTZ,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "banned_at" TIMESTAMPTZ,
    "ban_reason" TEXT,
    "dodo_customer_id" TEXT,
    "dodo_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "target_audience" TEXT,
    "voice" JSONB NOT NULL DEFAULT '{}',
    "palette" JSONB NOT NULL DEFAULT '{}',
    "fonts" JSONB NOT NULL DEFAULT '{}',
    "logo_url" TEXT,
    "guidelines" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "brand_id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "handle" TEXT NOT NULL,
    "session_enc" BYTEA,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_post_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "brand_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content_type" "ContentType" NOT NULL,
    "cron_expression" TEXT,
    "next_run_at" TIMESTAMPTZ,
    "topic_pool" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" "SocialPlatform"[] DEFAULT ARRAY[]::"SocialPlatform"[],
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "auto_publish" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "campaign_id" UUID,
    "status" "ContentJobStatus" NOT NULL DEFAULT 'PENDING',
    "content_type" "ContentType" NOT NULL,
    "topic" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" "SocialPlatform"[] DEFAULT ARRAY[]::"SocialPlatform"[],
    "output_url" TEXT,
    "output_key" TEXT,
    "thumbnail_url" TEXT,
    "posted_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "queue_plan" TEXT NOT NULL DEFAULT 'FREE',
    "queue_priority" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "content_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_events" (
    "id" BIGSERIAL NOT NULL,
    "job_id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "progress" DOUBLE PRECISION,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dodo_webhook_events" (
    "webhook_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dodo_webhook_events_pkey" PRIMARY KEY ("webhook_id")
);

-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profiles_dodo_subscription_id_idx" ON "profiles"("dodo_subscription_id");

-- CreateIndex
CREATE INDEX "brands_user_id_idx" ON "brands"("user_id");

-- CreateIndex
CREATE INDEX "social_accounts_brand_id_idx" ON "social_accounts"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_brand_id_platform_key" ON "social_accounts"("brand_id", "platform");

-- CreateIndex
CREATE INDEX "campaigns_brand_id_idx" ON "campaigns"("brand_id");

-- CreateIndex
CREATE INDEX "campaigns_active_next_run_at_idx" ON "campaigns"("active", "next_run_at");

-- CreateIndex
CREATE INDEX "content_jobs_user_id_created_at_idx" ON "content_jobs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_jobs_status_queue_priority_created_at_id_idx" ON "content_jobs"("status", "queue_priority" DESC, "created_at", "id");

-- CreateIndex
CREATE INDEX "content_jobs_brand_id_created_at_idx" ON "content_jobs"("brand_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "progress_events_job_id_created_at_idx" ON "progress_events"("job_id", "created_at");

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "content_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

