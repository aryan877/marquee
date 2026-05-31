-- WhatsApp self-delivery RPCs.

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_accounts FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.get_whatsapp_account();
CREATE FUNCTION public.get_whatsapp_account()
RETURNS TABLE (
  id                UUID,
  phone_e164        TEXT,
  display_name      TEXT,
  jid               TEXT,
  status            TEXT,
  last_qr_at        TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_send_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, phone_e164, display_name, jid, status, last_qr_at,
         last_connected_at, last_send_at, updated_at
  FROM public.whatsapp_accounts
  WHERE user_id = (select auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_account() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_whatsapp_delivery_session_for_service(UUID);
CREATE FUNCTION public.get_whatsapp_delivery_session_for_service(p_user_id UUID)
RETURNS TABLE (
  id                UUID,
  user_id           UUID,
  phone_e164        TEXT,
  display_name      TEXT,
  jid               TEXT,
  session_enc       BYTEA,
  status            TEXT,
  last_qr_at        TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_send_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, user_id, phone_e164, display_name, jid, session_enc, status,
         last_qr_at, last_connected_at, last_send_at
  FROM public.whatsapp_accounts
  WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_delivery_session_for_service(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_delivery_session_for_service(UUID)
  TO service_role;

DROP FUNCTION IF EXISTS public.upsert_whatsapp_delivery_account(UUID, TEXT, TEXT, TEXT, BYTEA, TEXT);
CREATE FUNCTION public.upsert_whatsapp_delivery_account(
  p_user_id      UUID,
  p_phone_e164   TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_jid          TEXT DEFAULT NULL,
  p_session_enc  BYTEA DEFAULT NULL,
  p_status       TEXT DEFAULT 'DISCONNECTED'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.whatsapp_accounts (
    user_id, phone_e164, display_name, jid, session_enc, status,
    last_qr_at, last_connected_at
  )
  VALUES (
    p_user_id, p_phone_e164, p_display_name, p_jid, p_session_enc, p_status,
    CASE WHEN p_status = 'QR' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'CONNECTED' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE
  SET phone_e164 = COALESCE(EXCLUDED.phone_e164, public.whatsapp_accounts.phone_e164),
      display_name = COALESCE(EXCLUDED.display_name, public.whatsapp_accounts.display_name),
      jid = COALESCE(EXCLUDED.jid, public.whatsapp_accounts.jid),
      session_enc = COALESCE(EXCLUDED.session_enc, public.whatsapp_accounts.session_enc),
      status = EXCLUDED.status,
      last_qr_at = CASE
        WHEN EXCLUDED.status = 'QR' THEN now()
        ELSE public.whatsapp_accounts.last_qr_at
      END,
      last_connected_at = CASE
        WHEN EXCLUDED.status = 'CONNECTED' THEN now()
        ELSE public.whatsapp_accounts.last_connected_at
      END,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_whatsapp_delivery_account(UUID, TEXT, TEXT, TEXT, BYTEA, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_whatsapp_delivery_account(UUID, TEXT, TEXT, TEXT, BYTEA, TEXT)
  TO service_role;

DROP FUNCTION IF EXISTS public.mark_whatsapp_delivery_sent(UUID);
CREATE FUNCTION public.mark_whatsapp_delivery_sent(p_user_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.whatsapp_accounts
  SET last_send_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.mark_whatsapp_delivery_sent(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_delivery_sent(UUID)
  TO service_role;

DROP FUNCTION IF EXISTS public.disconnect_whatsapp_delivery_account(UUID);
CREATE FUNCTION public.disconnect_whatsapp_delivery_account(p_user_id UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.whatsapp_accounts
  SET phone_e164 = NULL,
      display_name = NULL,
      jid = NULL,
      session_enc = NULL,
      status = 'DISCONNECTED',
      updated_at = now()
  WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.disconnect_whatsapp_delivery_account(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_whatsapp_delivery_account(UUID)
  TO service_role;
