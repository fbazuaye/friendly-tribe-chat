
ALTER TABLE public.broadcast_messages
  ADD COLUMN IF NOT EXISTS delivery_legacy boolean NOT NULL DEFAULT false;

-- Backfill: any older broadcast (>1h old) without delivery_completed_at is treated as legacy delivered
WITH sub_counts AS (
  SELECT bs.channel_id, COUNT(*) FILTER (WHERE bs.user_id <> bc.owner_id) AS audience
  FROM public.broadcast_subscribers bs
  JOIN public.broadcast_channels bc ON bc.id = bs.channel_id
  GROUP BY bs.channel_id
)
UPDATE public.broadcast_messages bm
SET
  delivery_completed_at = bm.created_at,
  delivery_legacy = true,
  total_recipients = COALESCE(NULLIF(bm.total_recipients, 0), sc.audience, 0)
FROM sub_counts sc
WHERE bm.delivery_completed_at IS NULL
  AND bm.created_at < (now() - interval '1 hour')
  AND sc.channel_id = bm.channel_id;

-- Also backfill any rows the join missed (no subscribers row)
UPDATE public.broadcast_messages
SET delivery_completed_at = created_at,
    delivery_legacy = true
WHERE delivery_completed_at IS NULL
  AND created_at < (now() - interval '1 hour');

-- Update RPCs to include delivery_legacy
DROP FUNCTION IF EXISTS public.get_broadcast_message_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_broadcast_message_stats(_message_id uuid)
 RETURNS TABLE(message_id uuid, total_recipients integer, push_sent_count integer, push_failed_count integer, read_count bigint, delivery_completed_at timestamp with time zone, delivery_legacy boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _channel_id uuid;
  _created_at timestamptz;
BEGIN
  SELECT bm.channel_id, bm.created_at INTO _channel_id, _created_at
  FROM broadcast_messages bm WHERE bm.id = _message_id;
  IF _channel_id IS NULL THEN RETURN; END IF;
  IF NOT public.is_channel_owner(auth.uid(), _channel_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    bm.id, bm.total_recipients, bm.push_sent_count, bm.push_failed_count,
    (SELECT COUNT(*)::bigint FROM broadcast_subscribers bs
       JOIN broadcast_channels bc ON bc.id = bs.channel_id
       WHERE bs.channel_id = _channel_id
         AND bs.user_id <> bc.owner_id
         AND bs.last_read_at IS NOT NULL
         AND bs.last_read_at >= _created_at) AS read_count,
    bm.delivery_completed_at,
    bm.delivery_legacy
  FROM broadcast_messages bm
  WHERE bm.id = _message_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_channel_broadcast_report(uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.get_channel_broadcast_report(_channel_id uuid, _since timestamp with time zone)
 RETURNS TABLE(message_id uuid, content text, created_at timestamp with time zone, total_recipients integer, push_sent_count integer, push_failed_count integer, read_count bigint, delivery_completed_at timestamp with time zone, delivery_legacy boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    bm.delivery_completed_at,
    bm.delivery_legacy
  FROM broadcast_messages bm
  WHERE bm.channel_id = _channel_id
    AND bm.created_at >= _since
  ORDER BY bm.created_at DESC;
END;
$function$;
