
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.complete_delivery_job(_job_id uuid, _success boolean, _sent integer, _failed integer, _error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _job public.delivery_jobs;
  _new_status text;
  _backoff interval;
  _pending int;
  _agg_sent int;
  _agg_failed int;
  _recipient_count int;
  _final_status text;
BEGIN
  SELECT * INTO _job FROM public.delivery_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF _success THEN
    _new_status := 'succeeded';
  ELSIF _job.attempts >= _job.max_attempts THEN
    _new_status := 'dead';
  ELSE
    _new_status := 'pending';
    _backoff := (power(2, _job.attempts) || ' minutes')::interval;
  END IF;

  UPDATE public.delivery_jobs
  SET status = _new_status,
      succeeded_count = succeeded_count + COALESCE(_sent, 0),
      failed_count = failed_count + COALESCE(_failed, 0),
      last_error = _error,
      next_attempt_at = CASE WHEN _new_status = 'pending' THEN now() + _backoff ELSE next_attempt_at END,
      claimed_at = CASE WHEN _new_status = 'pending' THEN NULL ELSE claimed_at END,
      claimed_by = CASE WHEN _new_status = 'pending' THEN NULL ELSE claimed_by END
  WHERE id = _job_id;

  -- Roll up to broadcast_messages counters
  IF _job.job_type = 'push' THEN
    UPDATE public.broadcast_messages
    SET push_sent_count = push_sent_count + COALESCE(_sent, 0),
        push_failed_count = push_failed_count + COALESCE(_failed, 0)
    WHERE id = _job.parent_id;
  END IF;

  -- Roll up SMS outcomes onto parent sms_logs row
  IF _job.job_type = 'sms' AND _job.parent_id IS NOT NULL THEN
    UPDATE public.sms_logs
    SET sent_count = sent_count + COALESCE(_sent, 0),
        failed_count = failed_count + COALESCE(_failed, 0),
        response_data = COALESCE(response_data, '{}'::jsonb)
          || jsonb_build_object('last_error', _error)
    WHERE id = _job.parent_id;

    -- If no more pending/claimed sms children, finalize status
    SELECT COUNT(*) INTO _pending
    FROM public.delivery_jobs
    WHERE parent_id = _job.parent_id
      AND job_type IN ('sms','enqueue_sms')
      AND status IN ('pending','claimed');

    IF _pending = 0 THEN
      SELECT
        COALESCE(SUM(succeeded_count),0),
        COALESCE(SUM(failed_count),0)
      INTO _agg_sent, _agg_failed
      FROM public.delivery_jobs
      WHERE parent_id = _job.parent_id AND job_type = 'sms';

      SELECT recipient_count INTO _recipient_count
      FROM public.sms_logs WHERE id = _job.parent_id;

      IF _agg_sent = 0 THEN
        _final_status := 'failed';
      ELSIF _agg_failed > 0 THEN
        _final_status := 'partial';
      ELSE
        _final_status := 'sent';
      END IF;

      UPDATE public.sms_logs
      SET status = _final_status
      WHERE id = _job.parent_id;
    END IF;
  END IF;
END;
$function$;
