
ALTER TABLE public.broadcast_subscribers ADD COLUMN last_read_at timestamp with time zone DEFAULT NULL;
