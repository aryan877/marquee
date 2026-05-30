DROP FUNCTION IF EXISTS public.update_brand(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB, BOOLEAN);
CREATE FUNCTION public.update_brand(
  p_brand_id        UUID,
  p_name            TEXT,
  p_handle          TEXT DEFAULT NULL,
  p_description     TEXT DEFAULT NULL,
  p_industry        TEXT DEFAULT NULL,
  p_target_audience TEXT DEFAULT NULL,
  p_voice           JSONB DEFAULT '{}'::JSONB,
  p_palette         JSONB DEFAULT '{}'::JSONB,
  p_fonts           JSONB DEFAULT '{}'::JSONB,
  p_logo_url        TEXT DEFAULT NULL,
  p_guidelines      JSONB DEFAULT '{}'::JSONB,
  p_is_active       BOOLEAN DEFAULT TRUE
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'brand name required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.brands b
  SET name            = BTRIM(p_name),
      handle          = NULLIF(BTRIM(p_handle), ''),
      description     = NULLIF(BTRIM(p_description), ''),
      industry        = NULLIF(BTRIM(p_industry), ''),
      target_audience = NULLIF(BTRIM(p_target_audience), ''),
      voice           = COALESCE(p_voice, '{}'::JSONB),
      palette         = COALESCE(p_palette, '{}'::JSONB),
      fonts           = COALESCE(p_fonts, '{}'::JSONB),
      logo_url        = NULLIF(BTRIM(p_logo_url), ''),
      guidelines      = COALESCE(p_guidelines, '{}'::JSONB),
      is_active       = COALESCE(p_is_active, TRUE),
      updated_at      = NOW()
  WHERE b.id = p_brand_id
    AND b.user_id = (select auth.uid())
  RETURNING b.id, b.name, b.handle, b.description, b.industry, b.target_audience,
            b.voice, b.palette, b.fonts, b.logo_url, b.guidelines, b.is_active, b.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.update_brand(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_brand(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB, BOOLEAN)
  TO authenticated, service_role;
