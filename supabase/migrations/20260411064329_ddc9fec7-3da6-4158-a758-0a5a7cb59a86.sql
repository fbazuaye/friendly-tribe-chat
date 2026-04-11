
ALTER TABLE public.broadcast_channels
  ADD COLUMN subscriber_count integer NOT NULL DEFAULT 0;

CREATE INDEX idx_broadcast_messages_channel_created
  ON public.broadcast_messages(channel_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_broadcast_subscriber_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE broadcast_channels SET subscriber_count = subscriber_count + 1
    WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE broadcast_channels SET subscriber_count = subscriber_count - 1
    WHERE id = OLD.channel_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_broadcast_subscriber_count
AFTER INSERT OR DELETE ON public.broadcast_subscribers
FOR EACH ROW EXECUTE FUNCTION public.update_broadcast_subscriber_count();

UPDATE public.broadcast_channels bc SET subscriber_count = (
  SELECT COUNT(*) FROM public.broadcast_subscribers bs WHERE bs.channel_id = bc.id
);
