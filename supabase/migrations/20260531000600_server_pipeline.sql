-- =============================================================================
-- Module: server_pipeline
-- Purpose: worker-pipeline reads + writes. service_role only.
--
-- Functions:
--   get_content_job_full(id)            → row the worker needs
--   get_content_job_for_approval(id)    → row approve route needs
--   get_brand_for_job(brand_id)         → brand context the agent uses
--   get_social_session(brand_id, platf) → decoded Playwright session
--   get_connected_social_accounts_for_job(id)
--   update_content_job_status(...)
--   mark_content_job_approved(id)
--   set_job_output(...)
--   set_job_caption(...)
--   emit_progress_event(...)            → the realtime fuel
-- =============================================================================

-- ─── get_content_job_full ───
DROP FUNCTION IF EXISTS public.get_content_job_full(UUID);
CREATE FUNCTION public.get_content_job_full(p_job_id UUID)
RETURNS TABLE (
  id             UUID,
  user_id        UUID,
  brand_id       UUID,
  campaign_id    UUID,
  status         public."ContentJobStatus",
  content_type   public."ContentType",
  topic          TEXT,
  platforms      public."SocialPlatform"[],
  queue_plan     TEXT,
  queue_priority INT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, user_id, brand_id, campaign_id, status, content_type, topic, platforms,
         queue_plan, queue_priority, metadata, created_at
  FROM public.content_jobs
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.get_content_job_full(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_job_full(UUID) TO service_role;

DROP FUNCTION IF EXISTS public.get_content_job_for_approval(UUID);
CREATE FUNCTION public.get_content_job_for_approval(p_job_id UUID)
RETURNS TABLE (
  id          UUID,
  user_id     UUID,
  brand_id    UUID,
  status      public."ContentJobStatus",
  output_url  TEXT,
  caption     TEXT,
  platforms   public."SocialPlatform"[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, user_id, brand_id, status, output_url, caption, platforms
  FROM public.content_jobs
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.get_content_job_for_approval(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_job_for_approval(UUID) TO service_role;

-- ─── get_brand_for_job (worker reads brand context to prompt the agent) ───
DROP FUNCTION IF EXISTS public.get_brand_for_job(UUID);
CREATE FUNCTION public.get_brand_for_job(p_brand_id UUID)
RETURNS TABLE (
  id              UUID,
  user_id         UUID,
  name            TEXT,
  handle          TEXT,
  description     TEXT,
  industry        TEXT,
  target_audience TEXT,
  voice           JSONB,
  palette         JSONB,
  fonts           JSONB,
  logo_url        TEXT,
  guidelines      JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, user_id, name, handle, description, industry, target_audience,
         voice, palette, fonts, logo_url, guidelines
  FROM public.brands
  WHERE id = p_brand_id;
$$;

REVOKE ALL ON FUNCTION public.get_brand_for_job(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_for_job(UUID) TO service_role;

-- ─── get_social_session ───
DROP FUNCTION IF EXISTS public.get_social_session(UUID, public."SocialPlatform");
CREATE FUNCTION public.get_social_session(
  p_brand_id UUID,
  p_platform public."SocialPlatform"
)
RETURNS TABLE (
  id      UUID,
  handle  TEXT,
  session BYTEA
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, handle, session_enc
  FROM public.social_accounts
  WHERE brand_id = p_brand_id AND platform = p_platform AND is_active;
$$;

REVOKE ALL ON FUNCTION public.get_social_session(UUID, public."SocialPlatform")
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_session(UUID, public."SocialPlatform")
  TO service_role;

DROP FUNCTION IF EXISTS public.get_connected_social_accounts_for_job(UUID);
CREATE FUNCTION public.get_connected_social_accounts_for_job(p_job_id UUID)
RETURNS TABLE (
  platform  public."SocialPlatform",
  handle    TEXT,
  is_active BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.platform, s.handle, s.is_active
  FROM public.content_jobs j
  JOIN public.social_accounts s ON s.brand_id = j.brand_id
  WHERE j.id = p_job_id
    AND s.is_active
  ORDER BY s.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_connected_social_accounts_for_job(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_connected_social_accounts_for_job(UUID) TO service_role;

-- ─── update_content_job_status ───
DROP FUNCTION IF EXISTS public.update_content_job_status(UUID, public."ContentJobStatus", TEXT);
CREATE FUNCTION public.update_content_job_status(
  p_job_id        UUID,
  p_status        public."ContentJobStatus",
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.content_jobs
  SET status        = p_status,
      error_message = COALESCE(p_error_message, error_message),
      completed_at  = CASE
        WHEN p_status IN (
          'POSTED'::public."ContentJobStatus",
          'FAILED'::public."ContentJobStatus",
          'CANCELLED'::public."ContentJobStatus"
        ) THEN now()
        ELSE completed_at
      END,
      posted_at = CASE
        WHEN p_status = 'POSTED'::public."ContentJobStatus" THEN now()
        ELSE posted_at
      END
  WHERE id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_content_job_status(UUID, public."ContentJobStatus", TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_content_job_status(UUID, public."ContentJobStatus", TEXT)
  TO service_role;

DROP FUNCTION IF EXISTS public.mark_content_job_approved(UUID);
CREATE FUNCTION public.mark_content_job_approved(p_job_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.content_jobs
  SET approved_at = now()
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.mark_content_job_approved(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_content_job_approved(UUID) TO service_role;

-- ─── set_job_output ───
DROP FUNCTION IF EXISTS public.set_job_output(UUID, TEXT, TEXT, TEXT);
CREATE FUNCTION public.set_job_output(
  p_job_id        UUID,
  p_output_url    TEXT,
  p_output_key    TEXT,
  p_thumbnail_url TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.content_jobs
  SET output_url    = p_output_url,
      output_key    = p_output_key,
      thumbnail_url = COALESCE(p_thumbnail_url, thumbnail_url)
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.set_job_output(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_output(UUID, TEXT, TEXT, TEXT)
  TO service_role;

-- ─── set_job_caption ───
DROP FUNCTION IF EXISTS public.set_job_caption(UUID, TEXT, TEXT[]);
CREATE FUNCTION public.set_job_caption(
  p_job_id   UUID,
  p_caption  TEXT,
  p_hashtags TEXT[]
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.content_jobs
  SET caption  = p_caption,
      hashtags = COALESCE(p_hashtags, ARRAY[]::TEXT[])
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.set_job_caption(UUID, TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_caption(UUID, TEXT, TEXT[])
  TO service_role;

-- ─── emit_progress_event ───
-- The fuel for Supabase Realtime → web. Worker calls this once per
-- pipeline micro-step ("script", "image", "frame 23/60", "uploading"…).
DROP FUNCTION IF EXISTS public.emit_progress_event(UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB);
CREATE FUNCTION public.emit_progress_event(
  p_job_id   UUID,
  p_step     TEXT,
  p_message  TEXT,
  p_progress DOUBLE PRECISION DEFAULT NULL,
  p_payload  JSONB            DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.progress_events (job_id, step, message, progress, payload)
  VALUES (p_job_id, p_step, p_message, p_progress, p_payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_progress_event(UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_progress_event(UUID, TEXT, TEXT, DOUBLE PRECISION, JSONB)
  TO service_role;

-- ─── worker_heartbeat (singleton row) ───
DROP FUNCTION IF EXISTS public.bump_worker_heartbeat();
CREATE FUNCTION public.bump_worker_heartbeat()
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.worker_heartbeat (id, updated_at)
  VALUES (1, now())
  ON CONFLICT (id) DO UPDATE SET updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.bump_worker_heartbeat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_worker_heartbeat() TO service_role;
