-- Add last_seen_at column to profiles for presence tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);

-- Enable realtime for profiles table (for presence updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;