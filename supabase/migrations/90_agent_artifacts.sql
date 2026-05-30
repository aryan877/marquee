-- Agent artifact RLS and RPCs.

ALTER TABLE public.content_job_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_job_artifacts_select_own ON public.content_job_artifacts;
CREATE POLICY content_job_artifacts_select_own
  ON public.content_job_artifacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_jobs j
      WHERE j.id = content_job_artifacts.job_id
        AND j.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS agent_usage_events_no_client_access ON public.agent_usage_events;
CREATE POLICY agent_usage_events_no_client_access
  ON public.agent_usage_events
  FOR SELECT
  TO authenticated
  USING (false);

DROP FUNCTION IF EXISTS public.create_job_artifact(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT, INT, INT, DOUBLE PRECISION, JSONB);
CREATE FUNCTION public.create_job_artifact(
  p_job_id     UUID,
  p_kind       TEXT,
  p_role       TEXT,
  p_iteration  INT DEFAULT 0,
  p_url        TEXT DEFAULT NULL,
  p_key        TEXT DEFAULT NULL,
  p_mime_type  TEXT DEFAULT NULL,
  p_width      INT DEFAULT NULL,
  p_height     INT DEFAULT NULL,
  p_duration_s DOUBLE PRECISION DEFAULT NULL,
  p_metadata   JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.content_job_artifacts (
    job_id, kind, role, iteration, url, key, mime_type, width, height, duration_s, metadata
  )
  VALUES (
    p_job_id, p_kind, p_role, COALESCE(p_iteration, 0), p_url, p_key, p_mime_type,
    p_width, p_height, p_duration_s, COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_job_artifact(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT, INT, INT, DOUBLE PRECISION, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_job_artifact(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT, INT, INT, DOUBLE PRECISION, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.get_job_artifacts(UUID);
CREATE FUNCTION public.get_job_artifacts(p_job_id UUID)
RETURNS TABLE (
  id         UUID,
  job_id     UUID,
  kind       TEXT,
  role       TEXT,
  iteration  INT,
  url        TEXT,
  key        TEXT,
  mime_type  TEXT,
  width      INT,
  height     INT,
  duration_s DOUBLE PRECISION,
  metadata   JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.id, a.job_id, a.kind, a.role, a.iteration, a.url, a.key, a.mime_type,
         a.width, a.height, a.duration_s, a.metadata, a.created_at
  FROM public.content_job_artifacts a
  JOIN public.content_jobs j ON j.id = a.job_id
  WHERE a.job_id = p_job_id
    AND (j.user_id = (select auth.uid()) OR (select auth.role()) = 'service_role')
  ORDER BY a.created_at ASC, a.id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_job_artifacts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_artifacts(UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.record_agent_usage(UUID, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB);
CREATE FUNCTION public.record_agent_usage(
  p_job_id             UUID,
  p_provider           TEXT,
  p_model              TEXT,
  p_purpose            TEXT,
  p_input_tokens       INT DEFAULT 0,
  p_output_tokens      INT DEFAULT 0,
  p_estimated_cost_usd NUMERIC DEFAULT 0,
  p_metadata           JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.agent_usage_events (
    job_id, provider, model, purpose, input_tokens, output_tokens, estimated_cost_usd, metadata
  )
  VALUES (
    p_job_id, p_provider, p_model, p_purpose, COALESCE(p_input_tokens, 0),
    COALESCE(p_output_tokens, 0), COALESCE(p_estimated_cost_usd, 0), COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_agent_usage(UUID, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_agent_usage(UUID, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.get_agent_daily_spend(DATE);
CREATE FUNCTION public.get_agent_daily_spend(p_day DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  FROM public.agent_usage_events
  WHERE created_at >= p_day::TIMESTAMPTZ
    AND created_at < (p_day + 1)::TIMESTAMPTZ;
$$;

REVOKE ALL ON FUNCTION public.get_agent_daily_spend(DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_daily_spend(DATE)
  TO service_role;
