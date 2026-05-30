-- CreateTable
CREATE TABLE "content_job_artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "key" TEXT,
    "mime_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_s" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_job_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_usage_events" (
    "id" BIGSERIAL NOT NULL,
    "job_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_job_artifacts_job_id_created_at_idx" ON "content_job_artifacts"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "content_job_artifacts_job_id_role_created_at_idx" ON "content_job_artifacts"("job_id", "role", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_usage_events_created_at_idx" ON "agent_usage_events"("created_at");

-- CreateIndex
CREATE INDEX "agent_usage_events_job_id_created_at_idx" ON "agent_usage_events"("job_id", "created_at");

-- AddForeignKey
ALTER TABLE "content_job_artifacts" ADD CONSTRAINT "content_job_artifacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "content_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_usage_events" ADD CONSTRAINT "agent_usage_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "content_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

