ALTER TABLE public.broadcast_messages
  ADD COLUMN IF NOT EXISTS total_recipients integer,
  ADD COLUMN IF NOT EXISTS push_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_completed_at timestamptz;

CREATE POLICY "Channel owners can update broadcast delivery stats"
  ON public.broadcast_messages
  FOR UPDATE
  USING (public.is_channel_owner(auth.uid(), channel_id))
  WITH CHECK (public.is_channel_owner(auth.uid(), channel_id));

CREATE OR REPLACE FUNCTION public.get_broadcast_message_stats(_message_id uuid)
RETURNS TABLE(
  message_id uuid,
  total_recipients integer,
  push_sent_count integer,
  push_failed_count integer,
  read_count bigint,
  delivery_completed_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _channel_id uuid;
  _created_at timestamptz;
BEGIN
  SELECT bm.channel_id, bm.created_at
    INTO _channel_id, _created_at
  FROM broadcast_messages bm
  WHERE bm.id = _message_id;

  IF _channel_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_channel_owner(auth.uid(), _channel_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    bm.id,
    bm.total_recipients,
    bm.push_sent_count,
    bm.push_failed_count,
    (
      SELECT COUNT(*)::bigint
      FROM broadcast_subscribers bs
      JOIN broadcast_channels bc ON bc.id = bs.channel_id
      WHERE bs.channel_id = _channel_id
        AND bs.user_id <> bc.owner_id
        AND bs.last_read_at IS NOT NULL
        AND bs.last_read_at >= _created_at
    ) AS read_count,
    bm.delivery_completed_at
  FROM broadcast_messages bm
  WHERE bm.id = _message_id;
END;
$$;