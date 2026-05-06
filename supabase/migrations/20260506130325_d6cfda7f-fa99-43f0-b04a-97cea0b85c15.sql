
-- Trigger A: auto-subscribe all org members on new channel
CREATE OR REPLACE FUNCTION public.auto_subscribe_org_members_to_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.broadcast_subscribers (channel_id, user_id)
  SELECT NEW.id, p.id
  FROM public.profiles p
  WHERE p.organization_id = NEW.organization_id
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_subscribe_on_channel_insert ON public.broadcast_channels;
CREATE TRIGGER trg_auto_subscribe_on_channel_insert
AFTER INSERT ON public.broadcast_channels
FOR EACH ROW
EXECUTE FUNCTION public.auto_subscribe_org_members_to_channel();

-- Trigger B: auto-subscribe new/joining org member to all org channels
CREATE OR REPLACE FUNCTION public.auto_subscribe_user_to_org_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.broadcast_subscribers (channel_id, user_id)
  SELECT bc.id, NEW.id
  FROM public.broadcast_channels bc
  WHERE bc.organization_id = NEW.organization_id
  ON CONFLICT (channel_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_subscribe_on_profile_org ON public.profiles;
CREATE TRIGGER trg_auto_subscribe_on_profile_org
AFTER INSERT OR UPDATE OF organization_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_subscribe_user_to_org_channels();

-- Backfill: subscribe all existing org members to all existing channels
INSERT INTO public.broadcast_subscribers (channel_id, user_id)
SELECT bc.id, p.id
FROM public.broadcast_channels bc
JOIN public.profiles p ON p.organization_id = bc.organization_id
ON CONFLICT (channel_id, user_id) DO NOTHING;

-- Recompute subscriber_count on all channels
UPDATE public.broadcast_channels bc
SET subscriber_count = (
  SELECT COUNT(*) FROM public.broadcast_subscribers WHERE channel_id = bc.id
);
