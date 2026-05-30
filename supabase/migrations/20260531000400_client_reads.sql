-- =============================================================================
-- Module: client_reads
-- Purpose: read-only RPCs the browser can call. authenticated grant.
--
-- All functions are SECURITY DEFINER and use `(select auth.uid())` to scope
-- to the calling user. Cross-tenant access is impossible by construction.
-- =============================================================================

-- ─── get_profile (current user) ───
DROP FUNCTION IF EXISTS public.get_profile();
CREATE FUNCTION public.get_profile()
RETURNS TABLE (
  id                   UUID,
  email                TEXT,
  username             TEXT,
  avatar_url           TEXT,
  plan                 TEXT,
  posts_used_period    INT,
  period_ends_at       TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  dodo_subscription_id TEXT,
  created_at           TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, email, username, avatar_url, plan, posts_used_period,
         period_ends_at, cancel_at_period_end, dodo_subscription_id, created_at
  FROM public.profiles
  WHERE id = (select auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.has_completed_onboarding();
CREATE FUNCTION public.has_completed_onboarding()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.brands
    WHERE user_id = (select auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.has_completed_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_completed_onboarding() TO authenticated, service_role;

-- ─── get_brands (current user, paginated) ───
DROP FUNCTION IF EXISTS public.get_brands(INT, TIMESTAMPTZ);
CREATE FUNCTION public.get_brands(
  p_limit  INT         DEFAULT 50,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  handle          TEXT,
  description     TEXT,
  industry        TEXT,
  target_audience TEXT,
  voice           JSONB,
  palette         JSONB,
  fonts           JSONB,
  logo_url        TEXT,
  guidelines      JSONB,
  is_active       BOOLEAN,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, name, handle, description, industry, target_audience,
         voice, palette, fonts, logo_url, guidelines, is_active, created_at
  FROM public.brands
  WHERE user_id = (select auth.uid())
    AND (p_cursor IS NULL OR created_at < p_cursor)
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_brands(INT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_brands(INT, TIMESTAMPTZ) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_brands_page(INT, TIMESTAMPTZ, UUID);
CREATE FUNCTION public.get_brands_page(
  p_limit              INT         DEFAULT 20,
  p_cursor_created_at  TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id          UUID        DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  handle          TEXT,
  description     TEXT,
  industry        TEXT,
  target_audience TEXT,
  voice           JSONB,
  palette         JSONB,
  fonts           JSONB,
  logo_url        TEXT,
  guidelines      JSONB,
  is_active       BOOLEAN,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, name, handle, description, industry, target_audience,
         voice, palette, fonts, logo_url, guidelines, is_active, created_at
  FROM public.brands
  WHERE user_id = (select auth.uid())
    AND (
      p_cursor_created_at IS NULL
      OR (created_at, id) < (p_cursor_created_at, COALESCE(p_cursor_id, id))
    )
  ORDER BY created_at DESC, id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 50) + 1;
$$;

REVOKE ALL ON FUNCTION public.get_brands_page(INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_brands_page(INT, TIMESTAMPTZ, UUID) TO authenticated, service_role;

-- ─── get_brand (one row, scoped) ───
DROP FUNCTION IF EXISTS public.get_brand(UUID);
CREATE FUNCTION public.get_brand(p_brand_id UUID)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  handle          TEXT,
  description     TEXT,
  industry        TEXT,
  target_audience TEXT,
  voice           JSONB,
  palette         JSONB,
  fonts           JSONB,
  logo_url        TEXT,
  guidelines      JSONB,
  is_active       BOOLEAN,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, name, handle, description, industry, target_audience,
         voice, palette, fonts, logo_url, guidelines, is_active, created_at
  FROM public.brands
  WHERE id = p_brand_id AND user_id = (select auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_brand(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_brand(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_connected_social_accounts(UUID);
CREATE FUNCTION public.get_connected_social_accounts(p_brand_id UUID)
RETURNS TABLE (
  platform  public."SocialPlatform",
  handle    TEXT,
  is_active BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.platform, s.handle, s.is_active
  FROM public.social_accounts s
  JOIN public.brands b ON b.id = s.brand_id
  WHERE s.brand_id = p_brand_id
    AND s.is_active
    AND b.user_id = (select auth.uid())
  ORDER BY s.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_connected_social_accounts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_connected_social_accounts(UUID) TO authenticated, service_role;

-- ─── get_content_jobs (current user, paginated) ───
DROP FUNCTION IF EXISTS public.get_content_jobs(UUID, INT, TIMESTAMPTZ);
CREATE FUNCTION public.get_content_jobs(
  p_brand_id UUID        DEFAULT NULL,
  p_limit    INT         DEFAULT 50,
  p_cursor   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id            UUID,
  brand_id      UUID,
  status        public."ContentJobStatus",
  content_type  public."ContentType",
  topic         TEXT,
  caption       TEXT,
  hashtags      TEXT[],
  platforms     public."SocialPlatform"[],
  output_url    TEXT,
  thumbnail_url TEXT,
  posted_at     TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, brand_id, status, content_type, topic, caption, hashtags, platforms,
         output_url, thumbnail_url, posted_at, error_message, created_at, completed_at
  FROM public.content_jobs
  WHERE user_id = (select auth.uid())
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_cursor IS NULL OR created_at < p_cursor)
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_content_jobs(UUID, INT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_content_jobs(UUID, INT, TIMESTAMPTZ) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_content_jobs_page(UUID, INT, TIMESTAMPTZ, UUID);
CREATE FUNCTION public.get_content_jobs_page(
  p_brand_id           UUID        DEFAULT NULL,
  p_limit              INT         DEFAULT 20,
  p_cursor_created_at  TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id          UUID        DEFAULT NULL
)
RETURNS TABLE (
  id            UUID,
  brand_id      UUID,
  brand_name    TEXT,
  status        public."ContentJobStatus",
  content_type  public."ContentType",
  topic         TEXT,
  caption       TEXT,
  platforms     public."SocialPlatform"[],
  output_url    TEXT,
  thumbnail_url TEXT,
  posted_at     TIMESTAMPTZ,
  approved_at   TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id, j.brand_id, b.name AS brand_name, j.status, j.content_type, j.topic,
         j.caption, j.platforms, j.output_url, j.thumbnail_url, j.posted_at,
         j.approved_at, j.error_message, j.created_at, j.completed_at
  FROM public.content_jobs j
  JOIN public.brands b ON b.id = j.brand_id
  WHERE j.user_id = (select auth.uid())
    AND (p_brand_id IS NULL OR j.brand_id = p_brand_id)
    AND (
      p_cursor_created_at IS NULL
      OR (j.created_at, j.id) < (p_cursor_created_at, COALESCE(p_cursor_id, j.id))
    )
  ORDER BY j.created_at DESC, j.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 50) + 1;
$$;

REVOKE ALL ON FUNCTION public.get_content_jobs_page(UUID, INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_content_jobs_page(UUID, INT, TIMESTAMPTZ, UUID) TO authenticated, service_role;

-- ─── get_content_job (one row, scoped) ───
DROP FUNCTION IF EXISTS public.get_content_job(UUID);
CREATE FUNCTION public.get_content_job(p_job_id UUID)
RETURNS TABLE (
  id             UUID,
  brand_id       UUID,
  campaign_id    UUID,
  status         public."ContentJobStatus",
  content_type   public."ContentType",
  topic          TEXT,
  caption        TEXT,
  hashtags       TEXT[],
  platforms      public."SocialPlatform"[],
  output_url     TEXT,
  thumbnail_url  TEXT,
  posted_at      TIMESTAMPTZ,
  approved_at    TIMESTAMPTZ,
  queue_priority INT,
  error_message  TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, brand_id, campaign_id, status, content_type, topic, caption, hashtags,
         platforms, output_url, thumbnail_url, posted_at, approved_at, queue_priority,
         error_message, metadata, created_at, completed_at
  FROM public.content_jobs
  WHERE id = p_job_id AND user_id = (select auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_content_job(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_content_job(UUID) TO authenticated, service_role;

-- ─── get_job_events (replay progress timeline for a job) ───
DROP FUNCTION IF EXISTS public.get_job_events(UUID);
CREATE FUNCTION public.get_job_events(p_job_id UUID)
RETURNS TABLE (
  id         BIGINT,
  step       TEXT,
  message    TEXT,
  progress   DOUBLE PRECISION,
  payload    JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id, e.step, e.message, e.progress::DOUBLE PRECISION, e.payload, e.created_at
  FROM public.progress_events e
  JOIN public.content_jobs j ON j.id = e.job_id
  WHERE e.job_id = p_job_id AND j.user_id = (select auth.uid())
  ORDER BY e.created_at ASC, e.id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_job_events(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_events(UUID) TO authenticated, service_role;

-- ─── get_campaigns (user's autopilot schedules) ───
DROP FUNCTION IF EXISTS public.get_campaigns(INT);
CREATE FUNCTION public.get_campaigns(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id              UUID,
  brand_id        UUID,
  name            TEXT,
  content_type    public."ContentType",
  platforms       public."SocialPlatform"[],
  cron_expression TEXT,
  topic_pool      TEXT[],
  active          BOOLEAN,
  autopilot       BOOLEAN,
  auto_publish    BOOLEAN,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.brand_id, c.name, c.content_type, c.platforms,
         c.cron_expression, c.topic_pool, c.active, c.autopilot,
         c.auto_publish, c.next_run_at, c.created_at
  FROM public.campaigns c
  JOIN public.brands b ON b.id = c.brand_id
  WHERE b.user_id = (select auth.uid())
  ORDER BY c.created_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_campaigns(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaigns(INT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_campaigns_page(INT, TIMESTAMPTZ, UUID);
CREATE FUNCTION public.get_campaigns_page(
  p_limit              INT         DEFAULT 20,
  p_cursor_created_at  TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id          UUID        DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  brand_id        UUID,
  brand_name      TEXT,
  name            TEXT,
  content_type    public."ContentType",
  platforms       public."SocialPlatform"[],
  cron_expression TEXT,
  topic_pool      TEXT[],
  active          BOOLEAN,
  autopilot       BOOLEAN,
  auto_publish    BOOLEAN,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.brand_id, b.name AS brand_name, c.name, c.content_type, c.platforms,
         c.cron_expression, c.topic_pool, c.active, c.autopilot,
         c.auto_publish, c.next_run_at, c.created_at
  FROM public.campaigns c
  JOIN public.brands b ON b.id = c.brand_id
  WHERE b.user_id = (select auth.uid())
    AND (
      p_cursor_created_at IS NULL
      OR (c.created_at, c.id) < (p_cursor_created_at, COALESCE(p_cursor_id, c.id))
    )
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 50) + 1;
$$;

REVOKE ALL ON FUNCTION public.get_campaigns_page(INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaigns_page(INT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
