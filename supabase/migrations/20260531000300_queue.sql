-- =============================================================================
-- Module: queue
-- Purpose: PGMQ queue the worker polls + priority dequeue.
--
-- Queue: content_jobs
--   Producer: submit_content_job (server_submit_refund migration) via pgmq.send
--   Consumer: apps/worker via read_next_content_job(vt)
--             Worker extends visibility with pgmq.set_vt while processing.
--             Terminal outcomes archive the message with pgmq.archive.
--
-- Priority model:
--   submit_content_job snapshots profiles.plan into content_jobs.queue_plan
--   and stores queue_priority via queue_priority_for_plan(). Dequeue order:
--     1. higher content_jobs.queue_priority
--     2. FIFO within same priority via (created_at, id)
--     3. msg_id as final tiebreaker
--
-- We never use pgmq.pop. read + archive keeps PGMQ durable until terminal.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pgmq.list_queues()
    WHERE queue_name = 'content_jobs'
  ) THEN
    PERFORM pgmq.create('content_jobs');
  END IF;
END;
$$;

-- ─── queue_priority_for_plan ───
-- Higher wins. Gaps of 100 so a new plan can slot in between.
DROP FUNCTION IF EXISTS public.queue_priority_for_plan(TEXT);
CREATE FUNCTION public.queue_priority_for_plan(p_plan TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE upper(coalesce(p_plan, 'FREE'))
    WHEN 'FOUNDER' THEN 200
    WHEN 'FREE'    THEN 0
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.queue_priority_for_plan(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_priority_for_plan(TEXT)
  TO service_role;

-- ─── read_next_content_job ───
-- Priority-aware equivalent of pgmq.read('content_jobs', vt, 1).
-- Stale terminal/malformed messages still surface (after PENDING jobs) so
-- the worker can archive them on its normal skip path.
DROP FUNCTION IF EXISTS public.read_next_content_job(INT);
CREATE FUNCTION public.read_next_content_job(p_visibility_timeout_seconds INT)
RETURNS TABLE (
  msg_id      BIGINT,
  read_ct     INT,
  enqueued_at TIMESTAMPTZ,
  vt          TIMESTAMPTZ,
  message     JSONB,
  headers     JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_visibility_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'visibility timeout must be positive';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT q.msg_id
    FROM pgmq.q_content_jobs q
    LEFT JOIN public.content_jobs j
      ON j.id = CASE
        WHEN q.message ? 'job_id'
          AND (q.message->>'job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (q.message->>'job_id')::UUID
        ELSE NULL
      END
    WHERE q.vt <= clock_timestamp()
    ORDER BY
      CASE WHEN j.status = 'PENDING'::public."ContentJobStatus" THEN 0 ELSE 1 END ASC,
      CASE WHEN j.status = 'PENDING'::public."ContentJobStatus" THEN j.queue_priority ELSE -2147483648 END DESC,
      CASE WHEN j.status = 'PENDING'::public."ContentJobStatus" THEN j.created_at ELSE q.enqueued_at END ASC,
      j.id ASC NULLS LAST,
      q.msg_id ASC
    LIMIT 1
    FOR UPDATE OF q SKIP LOCKED
  ),
  updated AS (
    UPDATE pgmq.q_content_jobs q
      SET vt      = clock_timestamp() + make_interval(secs => p_visibility_timeout_seconds),
          read_ct = q.read_ct + 1
    FROM candidate c
    WHERE q.msg_id = c.msg_id
    RETURNING q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message, q.headers
  )
  SELECT u.msg_id, u.read_ct, u.enqueued_at, u.vt, u.message, u.headers
  FROM updated u;
END;
$$;

REVOKE ALL ON FUNCTION public.read_next_content_job(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_next_content_job(INT)
  TO service_role;

-- ─── archive_content_job ───
DROP FUNCTION IF EXISTS public.archive_content_job(BIGINT);
CREATE FUNCTION public.archive_content_job(p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pgmq.archive('content_jobs'::TEXT, p_msg_id);
$$;

REVOKE ALL ON FUNCTION public.archive_content_job(BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_content_job(BIGINT)
  TO service_role;

-- ─── extend_content_job_vt ───
DROP FUNCTION IF EXISTS public.extend_content_job_vt(BIGINT, INT);
CREATE FUNCTION public.extend_content_job_vt(
  p_msg_id BIGINT,
  p_visibility_timeout_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_visibility_timeout_seconds <= 0 THEN
    RAISE EXCEPTION 'visibility timeout must be positive';
  END IF;

  UPDATE pgmq.q_content_jobs
  SET vt = clock_timestamp() + make_interval(secs => p_visibility_timeout_seconds)
  WHERE msg_id = p_msg_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_content_job_vt(BIGINT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_content_job_vt(BIGINT, INT)
  TO service_role;

-- ─── queue_position (client-callable estimate) ───
-- Returns the number of PENDING jobs ahead of this one in priority order.
DROP FUNCTION IF EXISTS public.queue_position(UUID);
CREATE FUNCTION public.queue_position(p_job_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner UUID;
  v_priority INT;
  v_created TIMESTAMPTZ;
  v_status public."ContentJobStatus";
  v_position INT;
BEGIN
  SELECT user_id, queue_priority, created_at, status
    INTO v_owner, v_priority, v_created, v_status
  FROM public.content_jobs
  WHERE id = p_job_id;

  IF v_owner IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_owner <> (select auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_status <> 'PENDING'::public."ContentJobStatus" THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
    INTO v_position
  FROM public.content_jobs j
  WHERE j.status = 'PENDING'::public."ContentJobStatus"
    AND (
      j.queue_priority > v_priority
      OR (j.queue_priority = v_priority AND (j.created_at, j.id) < (v_created, p_job_id))
    );

  RETURN v_position;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_position(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_position(UUID) TO authenticated, service_role;
