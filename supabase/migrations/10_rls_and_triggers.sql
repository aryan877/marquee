-- =============================================================================
-- Module: rls_and_triggers
-- Purpose: RLS flags, role grants, and the auth.users ↔ profiles glue.
--
-- Rule: table shape lives in Prisma. RLS, grants, triggers, RPCs live here.
-- Every read/write goes through SECURITY DEFINER RPCs in 30–70.
-- service_role bypasses RLS (server + worker calls).
-- =============================================================================

-- RLS on every public table.
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dodo_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_heartbeat    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations  ENABLE ROW LEVEL SECURITY;

-- Clients can't touch tables directly. RPCs only.
REVOKE ALL ON public.profiles            FROM anon, authenticated;
REVOKE ALL ON public.brands              FROM anon, authenticated;
REVOKE ALL ON public.social_accounts     FROM anon, authenticated;
REVOKE ALL ON public.campaigns           FROM anon, authenticated;
REVOKE ALL ON public.content_jobs        FROM anon, authenticated;
REVOKE ALL ON public.dodo_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.worker_heartbeat    FROM anon, authenticated;
REVOKE ALL ON public._prisma_migrations  FROM anon, authenticated;

-- ── auth.users INSERT → create profile row ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── auth.users DELETE → cascade the profile row ──
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- Trigger funcs must not be RPC-callable.
REVOKE ALL ON FUNCTION public.handle_new_user()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC, anon, authenticated;
