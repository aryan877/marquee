-- =============================================================================
-- Module: server_webhooks
-- Purpose: idempotent webhook handling. service_role only.
--
-- record_webhook_event: returns TRUE if this webhook_id is new, FALSE if it
-- has already been processed (caller skips). Wraps the insert in ON CONFLICT
-- so concurrent retries from Dodo race-safely.
-- =============================================================================

DROP FUNCTION IF EXISTS public.record_webhook_event(TEXT, TEXT, JSONB);
CREATE FUNCTION public.record_webhook_event(
  p_webhook_id TEXT,
  p_event_type TEXT,
  p_payload    JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  INSERT INTO public.dodo_webhook_events (webhook_id, event_type, payload)
  VALUES (p_webhook_id, p_event_type, p_payload)
  ON CONFLICT (webhook_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_webhook_event(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_event(TEXT, TEXT, JSONB)
  TO service_role;

DROP FUNCTION IF EXISTS public.mark_webhook_processed(TEXT, TEXT);
CREATE FUNCTION public.mark_webhook_processed(
  p_webhook_id    TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.dodo_webhook_events
  SET processed_at  = now(),
      error_message = p_error_message
  WHERE webhook_id = p_webhook_id;
$$;

REVOKE ALL ON FUNCTION public.mark_webhook_processed(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_webhook_processed(TEXT, TEXT)
  TO service_role;
