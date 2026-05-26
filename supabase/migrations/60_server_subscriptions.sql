-- =============================================================================
-- Module: server_subscriptions
-- Purpose: subscription state changes. service_role only.
--
-- Functions:
--   activate_subscription(user_id, sub_id, customer_id, period_end)
--   renew_subscription(sub_id, period_end)
--   cancel_subscription(sub_id, cancel_at_period_end)
--   expire_subscription(sub_id)
-- =============================================================================

DROP FUNCTION IF EXISTS public.activate_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ);
CREATE FUNCTION public.activate_subscription(
  p_user_id          UUID,
  p_subscription_id  TEXT,
  p_customer_id      TEXT,
  p_period_ends_at   TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
  SET plan                   = 'FOUNDER',
      dodo_customer_id       = p_customer_id,
      dodo_subscription_id   = p_subscription_id,
      period_ends_at         = p_period_ends_at,
      posts_used_period      = 0,
      cancel_at_period_end   = FALSE
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.activate_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

DROP FUNCTION IF EXISTS public.renew_subscription(TEXT, TIMESTAMPTZ);
CREATE FUNCTION public.renew_subscription(
  p_subscription_id TEXT,
  p_period_ends_at  TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
  SET period_ends_at       = p_period_ends_at,
      posts_used_period    = 0,
      cancel_at_period_end = FALSE
  WHERE dodo_subscription_id = p_subscription_id;
$$;

REVOKE ALL ON FUNCTION public.renew_subscription(TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscription(TEXT, TIMESTAMPTZ)
  TO service_role;

DROP FUNCTION IF EXISTS public.cancel_subscription(TEXT, BOOLEAN);
CREATE FUNCTION public.cancel_subscription(
  p_subscription_id      TEXT,
  p_cancel_at_period_end BOOLEAN
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
  SET cancel_at_period_end = p_cancel_at_period_end
  WHERE dodo_subscription_id = p_subscription_id;
$$;

REVOKE ALL ON FUNCTION public.cancel_subscription(TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_subscription(TEXT, BOOLEAN)
  TO service_role;

DROP FUNCTION IF EXISTS public.expire_subscription(TEXT);
CREATE FUNCTION public.expire_subscription(p_subscription_id TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
  SET plan                   = 'FREE',
      dodo_subscription_id   = NULL,
      period_ends_at         = NULL,
      posts_used_period      = 0,
      cancel_at_period_end   = FALSE
  WHERE dodo_subscription_id = p_subscription_id;
$$;

REVOKE ALL ON FUNCTION public.expire_subscription(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_subscription(TEXT)
  TO service_role;

-- Drop legacy orphan helper (no callers; webhook hits activate/renew directly).
DROP FUNCTION IF EXISTS public.get_profile_by_subscription(TEXT);
