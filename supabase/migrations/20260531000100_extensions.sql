-- =============================================================================
-- Module: extensions
-- Purpose: Postgres extensions Marquee depends on.
--
--   pgmq     — Postgres-native job queue (20_queue.sql)
--   pg_cron  — scheduler for autopilot + sweeper (80_worker_sweeper.sql)
--   pgcrypto — gen_random_uuid() + symmetric session encryption
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
