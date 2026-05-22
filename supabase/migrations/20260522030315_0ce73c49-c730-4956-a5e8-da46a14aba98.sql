
-- Per-recipient SMS tracking
CREATE TABLE IF NOT EXISTS public.sms_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_log_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  phone_number text NOT NULL,
  message_sid text,
  status text NOT NULL DEFAULT 'queued',
  error_code text,
  error_message text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_recipients_log ON public.sms_recipients(sms_log_id);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_org_created ON public.sms_recipients(organization_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_status ON public.sms_recipients(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_recipients_sid ON public.sms_recipients(message_sid) WHERE message_sid IS NOT NULL;

ALTER TABLE public.sms_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sms recipients"
ON public.sms_recipients FOR SELECT
USING (public.is_org_admin(auth.uid(), organization_id));

-- Aggregate counters on sms_logs
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS undelivered_count integer NOT NULL DEFAULT 0;

-- Org-level analytics
CREATE OR REPLACE FUNCTION public.get_sms_org_analytics(_org_id uuid, _from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_org_admin(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH base AS (
    SELECT * FROM public.sms_recipients
    WHERE organization_id = _org_id
      AND submitted_at >= _from
      AND submitted_at <= _to
  ),
  totals AS (
    SELECT
      COUNT(*)::bigint AS submitted,
      COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::bigint AS sent,
      COUNT(*) FILTER (WHERE status = 'delivered')::bigint AS delivered,
      COUNT(*) FILTER (WHERE status = 'undelivered')::bigint AS undelivered,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed,
      COUNT(*) FILTER (WHERE status IN ('queued','sent') AND delivered_at IS NULL)::bigint AS pending,
      COUNT(DISTINCT phone_number)::bigint AS unique_recipients
    FROM base
  ),
  daily AS (
    SELECT
      to_char(date_trunc('day', submitted_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS submitted,
      COUNT(*) FILTER (WHERE status = 'delivered')::bigint AS delivered,
      COUNT(*) FILTER (WHERE status IN ('undelivered','failed'))::bigint AS failed
    FROM base GROUP BY 1 ORDER BY 1
  ),
  errors AS (
    SELECT
      COALESCE(error_code, 'unknown') AS code,
      COALESCE(MAX(error_message), '') AS sample_message,
      COUNT(*)::bigint AS count
    FROM base
    WHERE status IN ('undelivered','failed') AND error_code IS NOT NULL
    GROUP BY 1 ORDER BY count DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::jsonb),
    'errors', COALESCE((SELECT jsonb_agg(to_jsonb(errors)) FROM errors), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- Per-campaign analytics
CREATE OR REPLACE FUNCTION public.get_sms_campaign_analytics(_sms_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  result jsonb;
BEGIN
  SELECT organization_id INTO _org FROM public.sms_logs WHERE id = _sms_log_id;
  IF _org IS NULL THEN RETURN NULL; END IF;
  IF NOT public.is_org_admin(auth.uid(), _org) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH base AS (
    SELECT * FROM public.sms_recipients WHERE sms_log_id = _sms_log_id
  ),
  totals AS (
    SELECT
      COUNT(*)::bigint AS submitted,
      COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::bigint AS sent,
      COUNT(*) FILTER (WHERE status = 'delivered')::bigint AS delivered,
      COUNT(*) FILTER (WHERE status = 'undelivered')::bigint AS undelivered,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed,
      COUNT(*) FILTER (WHERE status IN ('queued','sent') AND delivered_at IS NULL)::bigint AS pending
    FROM base
  ),
  errors AS (
    SELECT
      COALESCE(error_code, 'unknown') AS code,
      COALESCE(MAX(error_message), '') AS sample_message,
      COUNT(*)::bigint AS count
    FROM base WHERE status IN ('undelivered','failed') AND error_code IS NOT NULL
    GROUP BY 1 ORDER BY count DESC LIMIT 10
  ),
  timeline AS (
    SELECT
      to_char(date_trunc('minute', delivered_at), 'YYYY-MM-DD"T"HH24:MI:00') AS minute,
      COUNT(*)::bigint AS delivered
    FROM base WHERE delivered_at IS NOT NULL
    GROUP BY 1 ORDER BY 1 LIMIT 240
  )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'errors', COALESCE((SELECT jsonb_agg(to_jsonb(errors)) FROM errors), '[]'::jsonb),
    'timeline', COALESCE((SELECT jsonb_agg(to_jsonb(timeline)) FROM timeline), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- Apply Twilio status callback updates (called from edge function with service role)
CREATE OR REPLACE FUNCTION public.apply_sms_status_update(
  _message_sid text,
  _status text,
  _error_code text,
  _error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rec public.sms_recipients;
  _prev text;
BEGIN
  SELECT * INTO _rec FROM public.sms_recipients WHERE message_sid = _message_sid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  _prev := _rec.status;

  UPDATE public.sms_recipients
  SET status = _status,
      error_code = COALESCE(_error_code, error_code),
      error_message = COALESCE(_error_message, error_message),
      sent_at = CASE WHEN _status IN ('sent','delivered') AND sent_at IS NULL THEN now() ELSE sent_at END,
      delivered_at = CASE WHEN _status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
      updated_at = now()
  WHERE id = _rec.id;

  -- Rollup deltas only when transitioning into a terminal state we haven't counted
  IF _status = 'delivered' AND _prev <> 'delivered' THEN
    UPDATE public.sms_logs SET delivered_count = delivered_count + 1 WHERE id = _rec.sms_log_id;
  ELSIF _status = 'undelivered' AND _prev <> 'undelivered' THEN
    UPDATE public.sms_logs SET undelivered_count = undelivered_count + 1 WHERE id = _rec.sms_log_id;
  END IF;
END;
$$;
