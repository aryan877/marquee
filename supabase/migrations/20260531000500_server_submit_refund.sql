-- =============================================================================
-- Module: server_submit_refund
-- Purpose: quota-touching RPCs. service_role only.
--
-- Functions:
--   get_profile_for_job_submit(user_id)
--   submit_content_job(...)  → uuid   atomic quota deduct + insert + enqueue
--   refund_content_job(...)  → void   idempotent — marks FAILED + refunds
--   create_brand(...)        → uuid   insert + sane defaults
--   get_brand_owner(brand_id)
--   upsert_social_account()  → uuid   used by /api/social/connect
--
-- Trust boundary: only Next.js route handlers (server-side) hit these.
-- They auth the JWT, validate inputs against @marquee/shared/billing, then
-- invoke the RPC with service_role.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_profile_for_job_submit(UUID);
CREATE FUNCTION public.get_profile_for_job_submit(p_user_id UUID)
RETURNS TABLE (
  plan      TEXT,
  banned_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT plan, banned_at
  FROM public.profiles
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_profile_for_job_submit(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_for_job_submit(UUID) TO service_role;

-- ─── submit_content_job ───
DROP FUNCTION IF EXISTS public.submit_content_job(UUID, UUID, public."ContentType", TEXT, public."SocialPlatform"[], INT, UUID);
DROP FUNCTION IF EXISTS public.submit_content_job(UUID, UUID, public."ContentType", public."SocialPlatform"[], INT, TEXT, UUID);
CREATE FUNCTION public.submit_content_job(
  p_user_id      UUID,
  p_brand_id     UUID,
  p_content_type public."ContentType",
  p_platforms    public."SocialPlatform"[],
  p_post_budget  INT,
  p_topic        TEXT DEFAULT NULL,
  p_campaign_id  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id         UUID;
  v_queue_plan     TEXT;
  v_queue_priority INT;
  v_brand_owner    UUID;
BEGIN
  IF p_post_budget <= 0 THEN
    RAISE EXCEPTION 'Invalid post budget';
  END IF;

  -- Brand must belong to the user.
  SELECT user_id INTO v_brand_owner
  FROM public.brands
  WHERE id = p_brand_id;

  IF v_brand_owner IS NULL THEN
    RAISE EXCEPTION 'Brand not found';
  END IF;
  IF v_brand_owner <> p_user_id THEN
    RAISE EXCEPTION 'Brand does not belong to user';
  END IF;

  -- Atomic quota check + deduct. Succeeds only if:
  --   · account not banned
  --   · budget has room
  --   · billing period is live (or plan is FREE)
  UPDATE public.profiles
    SET posts_used_period = posts_used_period + 1
  WHERE id = p_user_id
    AND banned_at IS NULL
    AND posts_used_period + 1 <= p_post_budget
    AND (
      plan = 'FREE'
      OR (period_ends_at IS NOT NULL AND period_ends_at > now())
    )
  RETURNING plan INTO v_queue_plan;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND banned_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Account suspended';
    END IF;
    RAISE EXCEPTION 'Daily post limit reached or billing period expired';
  END IF;

  v_queue_priority := public.queue_priority_for_plan(v_queue_plan);

  INSERT INTO public.content_jobs (
    user_id, brand_id, campaign_id, status, content_type, topic, platforms,
    queue_plan, queue_priority
  )
  VALUES (
    p_user_id, p_brand_id, p_campaign_id, 'PENDING'::public."ContentJobStatus",
    p_content_type, p_topic, COALESCE(p_platforms, ARRAY[]::public."SocialPlatform"[]),
    v_queue_plan, v_queue_priority
  )
  RETURNING id INTO v_job_id;

  -- Seed the first progress event so the client UI has something to render
  -- before the worker picks it up.
  INSERT INTO public.progress_events (job_id, step, message, progress, payload)
  VALUES (
    v_job_id,
    'queued',
    'Job queued. Waiting for the next available worker…',
    0,
    jsonb_build_object('queue_plan', v_queue_plan, 'queue_priority', v_queue_priority)
  );

  PERFORM pgmq.send(
    queue_name := 'content_jobs',
    msg        := jsonb_build_object(
      'job_id',         v_job_id,
      'brand_id',       p_brand_id,
      'content_type',   p_content_type,
      'queue_plan',     v_queue_plan,
      'queue_priority', v_queue_priority
    )
  );

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_job(UUID, UUID, public."ContentType", public."SocialPlatform"[], INT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_content_job(UUID, UUID, public."ContentType", public."SocialPlatform"[], INT, TEXT, UUID)
  TO service_role;

-- ─── refund_content_job (idempotent) ───
DROP FUNCTION IF EXISTS public.refund_content_job(UUID, TEXT);
CREATE FUNCTION public.refund_content_job(
  p_job_id        UUID,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id          UUID;
  v_status           public."ContentJobStatus";
BEGIN
  SELECT user_id, status
    INTO v_user_id, v_status
  FROM public.content_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;

  -- Already terminal: noop.
  IF v_status IN ('FAILED'::public."ContentJobStatus",
                  'POSTED'::public."ContentJobStatus",
                  'CANCELLED'::public."ContentJobStatus") THEN
    RETURN;
  END IF;

  UPDATE public.content_jobs
    SET status        = 'FAILED'::public."ContentJobStatus",
        error_message = p_error_message,
        completed_at  = now()
  WHERE id = p_job_id;

  UPDATE public.profiles
    SET posts_used_period = GREATEST(posts_used_period - 1, 0)
  WHERE id = v_user_id;

  INSERT INTO public.progress_events (job_id, step, message, progress, payload)
  VALUES (
    p_job_id,
    'error',
    COALESCE(p_error_message, 'Something went wrong. Your post slot was refunded.'),
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_content_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_content_job(UUID, TEXT) TO service_role;

-- ─── create_brand ───
DROP FUNCTION IF EXISTS public.create_brand(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB);
CREATE FUNCTION public.create_brand(
  p_user_id         UUID,
  p_name            TEXT,
  p_handle          TEXT DEFAULT NULL,
  p_description     TEXT DEFAULT NULL,
  p_industry        TEXT DEFAULT NULL,
  p_target_audience TEXT DEFAULT NULL,
  p_voice           JSONB DEFAULT '{}'::JSONB,
  p_palette         JSONB DEFAULT '{}'::JSONB,
  p_fonts           JSONB DEFAULT '{}'::JSONB,
  p_logo_url        TEXT DEFAULT NULL,
  p_guidelines      JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brand_id UUID;
BEGIN
  INSERT INTO public.brands (
    user_id, name, handle, description, industry, target_audience,
    voice, palette, fonts, logo_url, guidelines
  )
  VALUES (
    p_user_id, p_name, p_handle, p_description, p_industry, p_target_audience,
    p_voice, p_palette, p_fonts, p_logo_url, p_guidelines
  )
  RETURNING id INTO v_brand_id;

  RETURN v_brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_brand(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_brand(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.get_brand_owner(UUID);
CREATE FUNCTION public.get_brand_owner(p_brand_id UUID)
RETURNS TABLE (
  id      UUID,
  user_id UUID
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, user_id
  FROM public.brands
  WHERE id = p_brand_id;
$$;

REVOKE ALL ON FUNCTION public.get_brand_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_owner(UUID) TO service_role;

-- ─── upsert_social_account ───
DROP FUNCTION IF EXISTS public.upsert_social_account(UUID, public."SocialPlatform", TEXT, BYTEA);
CREATE FUNCTION public.upsert_social_account(
  p_brand_id    UUID,
  p_platform    public."SocialPlatform",
  p_handle      TEXT,
  p_session_enc BYTEA DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.social_accounts (brand_id, platform, handle, session_enc)
  VALUES (p_brand_id, p_platform, p_handle, p_session_enc)
  ON CONFLICT (brand_id, platform) DO UPDATE
    SET handle      = EXCLUDED.handle,
        session_enc = COALESCE(EXCLUDED.session_enc, public.social_accounts.session_enc),
        updated_at  = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_social_account(UUID, public."SocialPlatform", TEXT, BYTEA)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_account(UUID, public."SocialPlatform", TEXT, BYTEA)
  TO service_role;
