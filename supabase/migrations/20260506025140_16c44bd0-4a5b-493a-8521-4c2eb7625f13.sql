
-- Extensions for scheduled dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Delivery jobs queue
CREATE TABLE public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('push','sms')),
  parent_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  recipient_user_ids uuid[] DEFAULT NULL,
  phone_numbers text[] DEFAULT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','succeeded','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  claimed_at timestamptz,
  claimed_by text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  succeeded_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_jobs_pending ON public.delivery_jobs (status, next_attempt_at) WHERE status IN ('pending','claimed');
CREATE INDEX idx_delivery_jobs_parent ON public.delivery_jobs (parent_id);
CREATE INDEX idx_delivery_jobs_org ON public.delivery_jobs (organization_id);

ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view delivery jobs"
  ON public.delivery_jobs FOR SELECT
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_delivery_jobs_updated
  BEFORE UPDATE ON public.delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Claim pending jobs atomically
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(_limit int, _worker_id text)
RETURNS SETOF public.delivery_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.delivery_jobs dj
  SET status = 'claimed',
      claimed_at = now(),
      claimed_by = _worker_id,
      attempts = dj.attempts + 1
  WHERE dj.id IN (
    SELECT id FROM public.delivery_jobs
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING dj.*;
END;
$$;

-- Complete a job and roll counters up to the parent
CREATE OR REPLACE FUNCTION public.complete_delivery_job(
  _job_id uuid,
  _success boolean,
  _sent int,
  _failed int,
  _error text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.delivery_jobs;
  _new_status text;
  _backoff interval;
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
END;
$$;

-- Mark parent complete when all jobs finish
CREATE OR REPLACE FUNCTION public.check_delivery_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pending_count int;
BEGIN
  IF NEW.status IN ('succeeded','dead','failed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COUNT(*) INTO _pending_count
    FROM public.delivery_jobs
    WHERE parent_id = NEW.parent_id AND status IN ('pending','claimed');

    IF _pending_count = 0 AND NEW.job_type = 'push' THEN
      UPDATE public.broadcast_messages
      SET delivery_completed_at = now()
      WHERE id = NEW.parent_id AND delivery_completed_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_jobs_completion
  AFTER UPDATE ON public.delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.check_delivery_completion();

-- Live progress for UI
CREATE OR REPLACE FUNCTION public.get_delivery_progress(_parent_id uuid)
RETURNS TABLE(
  total_jobs bigint,
  pending bigint,
  claimed bigint,
  succeeded bigint,
  failed bigint,
  dead bigint,
  recipients_sent bigint,
  recipients_failed bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status='pending')::bigint,
    COUNT(*) FILTER (WHERE status='claimed')::bigint,
    COUNT(*) FILTER (WHERE status='succeeded')::bigint,
    COUNT(*) FILTER (WHERE status='failed')::bigint,
    COUNT(*) FILTER (WHERE status='dead')::bigint,
    COALESCE(SUM(succeeded_count),0)::bigint,
    COALESCE(SUM(failed_count),0)::bigint
  FROM public.delivery_jobs
  WHERE parent_id = _parent_id;
$$;
