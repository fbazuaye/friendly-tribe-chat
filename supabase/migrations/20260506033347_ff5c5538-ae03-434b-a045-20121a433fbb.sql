
CREATE OR REPLACE FUNCTION public.cleanup_fake_subscribers(_channel_id uuid, _limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org_id uuid;
  _deleted integer;
BEGIN
  IF NOT public.is_channel_owner(auth.uid(), _channel_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT organization_id INTO _org_id FROM public.broadcast_channels WHERE id = _channel_id;

  WITH victims AS (
    SELECT bs.id
    FROM public.broadcast_subscribers bs
    LEFT JOIN public.profiles p
      ON p.id = bs.user_id AND p.organization_id = _org_id
    WHERE bs.channel_id = _channel_id
      AND p.id IS NULL
    LIMIT _limit
  ),
  del AS (
    DELETE FROM public.broadcast_subscribers
    WHERE id IN (SELECT id FROM victims)
    RETURNING 1
  )
  SELECT COUNT(*) INTO _deleted FROM del;

  RETURN _deleted;
END;
$$;
