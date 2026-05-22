
-- Prevent duplicate sms_recipients rows when backfilling repeatedly
CREATE UNIQUE INDEX IF NOT EXISTS sms_recipients_log_sid_unique
  ON public.sms_recipients (sms_log_id, message_sid)
  WHERE message_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_recipients_log_phone_idx
  ON public.sms_recipients (sms_log_id, phone_number);

-- Recompute aggregate status on sms_logs from sms_recipients
CREATE OR REPLACE FUNCTION public.recompute_sms_log_status(_sms_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
  _total int;
  _delivered int;
  _undelivered int;
  _failed int;
  _sent int;
  _final text;
BEGIN
  SELECT organization_id INTO _org FROM public.sms_logs WHERE id = _sms_log_id;
  IF _org IS NULL THEN RETURN; END IF;
  IF NOT public.is_org_admin(auth.uid(), _org) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'delivered')::int,
    COUNT(*) FILTER (WHERE status = 'undelivered')::int,
    COUNT(*) FILTER (WHERE status = 'failed')::int,
    COUNT(*) FILTER (WHERE status IN ('sent','delivered'))::int
  INTO _total, _delivered, _undelivered, _failed, _sent
  FROM public.sms_recipients
  WHERE sms_log_id = _sms_log_id;

  IF _total = 0 THEN RETURN; END IF;

  IF _sent = 0 THEN
    _final := 'failed';
  ELSIF (_undelivered + _failed) > 0 THEN
    _final := 'partial';
  ELSE
    _final := 'sent';
  END IF;

  UPDATE public.sms_logs
  SET status = _final,
      sent_count = GREATEST(sent_count, _sent),
      delivered_count = GREATEST(delivered_count, _delivered),
      undelivered_count = GREATEST(undelivered_count, _undelivered),
      failed_count = GREATEST(failed_count, _failed)
  WHERE id = _sms_log_id;
END;
$$;
