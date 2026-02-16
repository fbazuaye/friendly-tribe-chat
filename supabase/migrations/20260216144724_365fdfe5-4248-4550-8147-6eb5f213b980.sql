
-- Table to store Web Push subscriptions per user
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
ON public.push_subscriptions FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Trigger to update updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to notify edge function when a new message is inserted
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := jsonb_build_object(
      'type', TG_ARGV[0],
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger for direct messages
CREATE TRIGGER on_new_message_push
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_message('message');

-- Trigger for broadcast messages
CREATE TRIGGER on_new_broadcast_push
AFTER INSERT ON public.broadcast_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_message('broadcast');
