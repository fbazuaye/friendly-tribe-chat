
-- 1. bulk_subscribe_users RPC (channel-owner only)
CREATE OR REPLACE FUNCTION public.bulk_subscribe_users(_channel_id uuid, _user_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted integer;
BEGIN
  IF NOT public.is_channel_owner(auth.uid(), _channel_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Disable the per-row trigger for this statement to keep bulk insert fast
  WITH ins AS (
    INSERT INTO public.broadcast_subscribers (channel_id, user_id)
    SELECT _channel_id, uid
    FROM unnest(_user_ids) AS uid
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO _inserted FROM ins;

  -- Recompute subscriber_count once at the end (trigger already updated it row-by-row,
  -- but we recompute defensively to keep counts authoritative).
  UPDATE public.broadcast_channels
  SET subscriber_count = (
    SELECT COUNT(*) FROM public.broadcast_subscribers WHERE channel_id = _channel_id
  )
  WHERE id = _channel_id;

  RETURN _inserted;
END;
$$;

-- 2. Widen total_recipients to bigint
ALTER TABLE public.broadcast_messages
  ALTER COLUMN total_recipients TYPE bigint;

-- 3. Performance indexes for 1M-scale fan-out
CREATE INDEX IF NOT EXISTS idx_broadcast_subscribers_channel_lastread
  ON public.broadcast_subscribers (channel_id, last_read_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_subscribers_channel_id_pk
  ON public.broadcast_subscribers (channel_id, id);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_parent_status
  ON public.delivery_jobs (parent_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_pending_next_attempt
  ON public.delivery_jobs (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_sms_contacts_org_id_pk
  ON public.sms_contacts (organization_id, id);
