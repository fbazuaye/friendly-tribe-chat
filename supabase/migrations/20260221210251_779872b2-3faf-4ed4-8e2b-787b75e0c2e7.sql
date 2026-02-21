-- Create storage bucket for community avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('community-avatars', 'community-avatars', true);

-- Allow authenticated users to upload avatars
CREATE POLICY "Authenticated users can upload community avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'community-avatars' AND auth.role() = 'authenticated');

-- Anyone can view community avatars (public bucket)
CREATE POLICY "Community avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'community-avatars');

-- Uploaders can update their files
CREATE POLICY "Users can update their community avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'community-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Uploaders can delete their files
CREATE POLICY "Users can delete their community avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'community-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);