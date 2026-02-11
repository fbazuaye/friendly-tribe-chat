-- Drop old update policy and create a new one allowing conversation participants to update metadata
DROP POLICY "Users can update their own messages" ON public.messages;

-- Allow any conversation participant to update messages in their conversations
-- This enables reactions on other people's messages
CREATE POLICY "Participants can update messages in their conversations"
ON public.messages
FOR UPDATE
USING (is_conversation_participant(auth.uid(), conversation_id));