-- Drop triggers that use pg_net (which doesn't exist in Lovable Cloud)
DROP TRIGGER IF EXISTS on_new_message_push ON public.messages;
DROP TRIGGER IF EXISTS on_new_broadcast_push ON public.broadcast_messages;
DROP FUNCTION IF EXISTS public.notify_new_message();
