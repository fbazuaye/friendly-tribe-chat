-- 1. page_visits table
CREATE TABLE public.page_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text,
  user_id uuid,
  organization_id uuid,
  path text NOT NULL,
  referrer text,
  country text,
  country_code text,
  region text,
  city text,
  device_type text,
  browser text,
  os text,
  user_agent text,
  ip_hash text
);

CREATE INDEX idx_page_visits_created_at ON public.page_visits (created_at DESC);
CREATE INDEX idx_page_visits_org ON public.page_visits (organization_id, created_at DESC);
CREATE INDEX idx_page_visits_country ON public.page_visits (country_code);
CREATE INDEX idx_page_visits_device ON public.page_visits (device_type);
CREATE INDEX idx_page_visits_path ON public.page_visits (path);

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a visit (anonymous tracking via edge fn / client)
CREATE POLICY "Anyone can log a visit"
ON public.page_visits
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Org admins can read visits for their org
CREATE POLICY "Org admins can view their org visits"
ON public.page_visits
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_admin(auth.uid(), organization_id)
);

-- Super admin of LiveGig can also view unattributed (anonymous) visits
CREATE POLICY "Super admins can view anonymous visits"
ON public.page_visits
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  )
);

-- 2. Aggregation RPC
CREATE OR REPLACE FUNCTION public.get_visit_analytics(
  _org_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_super boolean;
  result jsonb;
BEGIN
  -- Authz: caller must be admin of _org_id (or super admin for global)
  IF _org_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    ) INTO is_super;
    IF NOT is_super THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    IF NOT public.is_org_admin(auth.uid(), _org_id) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  WITH base AS (
    SELECT *
    FROM page_visits
    WHERE created_at >= _from
      AND created_at <= _to
      AND (
        (_org_id IS NULL) OR (organization_id = _org_id)
      )
  ),
  totals AS (
    SELECT
      COUNT(*)::bigint AS total_visits,
      COUNT(DISTINCT session_id)::bigint AS unique_visitors
    FROM base
  ),
  countries AS (
    SELECT COALESCE(country, 'Unknown') AS label,
           COALESCE(country_code, '') AS code,
           COUNT(*)::bigint AS value
    FROM base
    GROUP BY 1, 2
    ORDER BY value DESC
    LIMIT 15
  ),
  devices AS (
    SELECT COALESCE(device_type, 'unknown') AS label, COUNT(*)::bigint AS value
    FROM base GROUP BY 1 ORDER BY value DESC
  ),
  browsers AS (
    SELECT COALESCE(browser, 'unknown') AS label, COUNT(*)::bigint AS value
    FROM base GROUP BY 1 ORDER BY value DESC LIMIT 10
  ),
  oses AS (
    SELECT COALESCE(os, 'unknown') AS label, COUNT(*)::bigint AS value
    FROM base GROUP BY 1 ORDER BY value DESC LIMIT 10
  ),
  pages AS (
    SELECT path AS label, COUNT(*)::bigint AS value
    FROM base GROUP BY 1 ORDER BY value DESC LIMIT 15
  ),
  referrers AS (
    SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS label, COUNT(*)::bigint AS value
    FROM base GROUP BY 1 ORDER BY value DESC LIMIT 10
  ),
  daily AS (
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           COUNT(*)::bigint AS visits,
           COUNT(DISTINCT session_id)::bigint AS uniques
    FROM base
    GROUP BY 1
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'countries', COALESCE((SELECT jsonb_agg(to_jsonb(countries)) FROM countries), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(devices)) FROM devices), '[]'::jsonb),
    'browsers', COALESCE((SELECT jsonb_agg(to_jsonb(browsers)) FROM browsers), '[]'::jsonb),
    'oses', COALESCE((SELECT jsonb_agg(to_jsonb(oses)) FROM oses), '[]'::jsonb),
    'pages', COALESCE((SELECT jsonb_agg(to_jsonb(pages)) FROM pages), '[]'::jsonb),
    'referrers', COALESCE((SELECT jsonb_agg(to_jsonb(referrers)) FROM referrers), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;