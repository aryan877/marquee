DROP FUNCTION IF EXISTS public.set_content_job_platforms(UUID, public."SocialPlatform"[]);
CREATE FUNCTION public.set_content_job_platforms(
  p_job_id UUID,
  p_platforms public."SocialPlatform"[]
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.content_jobs
  SET platforms = COALESCE(p_platforms, ARRAY[]::public."SocialPlatform"[])
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.set_content_job_platforms(UUID, public."SocialPlatform"[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_content_job_platforms(UUID, public."SocialPlatform"[]) TO service_role;
