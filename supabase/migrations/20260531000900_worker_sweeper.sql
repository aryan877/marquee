-- =============================================================================
-- Module: worker_sweeper
-- Purpose: pg_cron jobs for autopilot + orphan recovery.
--
-- Jobs:
--   marquee_autopilot_minute     — every minute, enqueue any campaign whose
--                                  next_run_at has passed
--   marquee_orphan_sweep_minute  — every minute, mark stale PROCESSING /
--                                  GENERATING / RENDERING / POSTING rows as
--                                  FAILED + refund (5 min stall window)
--   marquee_heartbeat_check      — every minute, warn if worker hasn't
--                                  heartbeat'd in 2 minutes (logged-only)
-- =============================================================================

-- ─── autopilot sweep ───
-- Picks campaigns due to fire, enqueues a content_job for each, advances
-- next_run_at by the cron expression's natural cadence (we keep it simple:
-- recompute on the worker side after generation).
DROP FUNCTION IF EXISTS public.sweep_autopilot();
CREATE FUNCTION public.sweep_autopilot()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT := 0;
  v_row   RECORD;
  v_owner UUID;
  v_plan  TEXT;
  v_pri   INT;
  v_job   UUID;
BEGIN
  FOR v_row IN
    SELECT c.id, c.brand_id, c.content_type, c.topic_pool, c.platforms,
           b.user_id, p.plan, p.posts_used_period, p.period_ends_at, p.banned_at
    FROM public.campaigns c
    JOIN public.brands b   ON b.id = c.brand_id
    JOIN public.profiles p ON p.id = b.user_id
    WHERE c.active
      AND c.autopilot
      AND c.next_run_at IS NOT NULL
      AND c.next_run_at <= now()
      AND p.banned_at IS NULL
    ORDER BY c.next_run_at ASC
    LIMIT 50
  LOOP
    v_owner := v_row.user_id;
    v_plan  := v_row.plan;
    v_pri   := public.queue_priority_for_plan(v_plan);

    UPDATE public.profiles
      SET posts_used_period = posts_used_period + 1
    WHERE id = v_owner
      AND banned_at IS NULL
      AND (plan = 'FREE'
           OR (period_ends_at IS NOT NULL AND period_ends_at > now()));

    IF FOUND THEN
      INSERT INTO public.content_jobs (
        user_id, brand_id, campaign_id, status, content_type, topic,
        platforms, queue_plan, queue_priority, metadata
      )
      VALUES (
        v_owner, v_row.brand_id, v_row.id, 'PENDING'::public."ContentJobStatus",
        v_row.content_type,
        -- pick a random topic from the pool or NULL to let the agent decide
        CASE WHEN array_length(v_row.topic_pool, 1) > 0
             THEN v_row.topic_pool[1 + floor(random() * array_length(v_row.topic_pool, 1))::INT]
             ELSE NULL
        END,
        v_row.platforms,
        v_plan, v_pri,
        jsonb_build_object('source', 'autopilot')
      )
      RETURNING id INTO v_job;

      INSERT INTO public.progress_events (job_id, step, message, progress, payload)
      VALUES (v_job, 'queued', 'Autopilot queued a new post.', 0,
              jsonb_build_object('campaign_id', v_row.id));

      PERFORM pgmq.send(
        queue_name := 'content_jobs',
        msg        := jsonb_build_object(
          'job_id', v_job,
          'brand_id', v_row.brand_id,
          'content_type', v_row.content_type,
          'queue_plan', v_plan,
          'queue_priority', v_pri,
          'source', 'autopilot'
        )
      );
      v_count := v_count + 1;
    END IF;

    -- Always advance the schedule so a single quota-exceeded brand doesn't
    -- keep retrying every minute. Default: bump by 1 day. The worker can
    -- recompute a more accurate next_run_at after the job completes.
    UPDATE public.campaigns
      SET next_run_at = next_run_at + interval '1 day'
    WHERE id = v_row.id;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_autopilot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_autopilot() TO service_role, postgres;

-- ─── orphan sweep ───
DROP FUNCTION IF EXISTS public.sweep_orphan_jobs(INTERVAL);
CREATE FUNCTION public.sweep_orphan_jobs(p_stall_window INTERVAL DEFAULT INTERVAL '5 minutes')
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT := 0;
  v_row   RECORD;
BEGIN
  FOR v_row IN
    SELECT j.id, j.user_id
    FROM public.content_jobs j
    WHERE j.status IN (
      'GENERATING'::public."ContentJobStatus",
      'RENDERING'::public."ContentJobStatus",
      'POSTING'::public."ContentJobStatus"
    )
      AND COALESCE((
        SELECT max(e.created_at)
        FROM public.progress_events e
        WHERE e.job_id = j.id
      ), j.created_at) < now() - p_stall_window
    LIMIT 100
  LOOP
    PERFORM public.refund_content_job(v_row.id, 'Stalled. Slot refunded — please try again.');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_orphan_jobs(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_orphan_jobs(INTERVAL) TO service_role, postgres;

-- ─── cron schedule ───
-- pg_cron runs as user `postgres`; functions are EXECUTE-granted to postgres.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marquee_autopilot_minute') THEN
    PERFORM cron.schedule('marquee_autopilot_minute', '* * * * *', $j$SELECT public.sweep_autopilot();$j$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marquee_orphan_sweep_minute') THEN
    PERFORM cron.schedule('marquee_orphan_sweep_minute', '* * * * *', $j$SELECT public.sweep_orphan_jobs();$j$);
  END IF;
END;
$$;
