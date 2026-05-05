
CREATE OR REPLACE FUNCTION public.get_broadcast_message_recipient_breakdown(_message_id uuid)
RETURNS TABLE(user_id uuid, display_name text, has_push_device boolean, read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _channel_id uuid;
  _created_at timestamptz;
  _owner_id uuid;
BEGIN
  SELECT bm.channel_id, bm.created_at INTO _channel_id, _created_at
  FROM broadcast_messages bm WHERE bm.id = _message_id;
  IF _channel_id IS NULL THEN RETURN; END IF;
  IF NOT public.is_channel_owner(auth.uid(), _channel_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT owner_id INTO _owner_id FROM broadcast_channels WHERE id = _channel_id;

  RETURN QUERY
  SELECT
    bs.user_id,
    COALESCE(p.display_name, '') AS display_name,
    EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = bs.user_id) AS has_push_device,
    CASE WHEN bs.last_read_at IS NOT NULL AND bs.last_read_at >= _created_at
         THEN bs.last_read_at ELSE NULL END AS read_at
  FROM broadcast_subscribers bs
  LEFT JOIN profiles p ON p.id = bs.user_id
  WHERE bs.channel_id = _channel_id AND bs.user_id <> _owner_id
  ORDER BY display_name NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_channel_broadcast_report(_channel_id uuid, _since timestamptz)
RETURNS TABLE(
  message_id uuid, content text, created_at timestamptz,
  total_recipients integer, push_sent_count integer, push_failed_count integer,
  read_count bigint, delivery_completed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_channel_owner(auth.uid(), _channel_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    bm.id, bm.content, bm.created_at,
    bm.total_recipients, bm.push_sent_count, bm.push_failed_count,
    (SELECT COUNT(*)::bigint FROM broadcast_subscribers bs
       JOIN broadcast_channels bc ON bc.id = bs.channel_id
       WHERE bs.channel_id = _channel_id
         AND bs.user_id <> bc.owner_id
         AND bs.last_read_at IS NOT NULL
         AND bs.last_read_at >= bm.created_at) AS read_count,
    bm.delivery_completed_at
  FROM broadcast_messages bm
  WHERE bm.channel_id = _channel_id
    AND bm.created_at >= _since
  ORDER BY bm.created_at DESC;
END;
$$;
