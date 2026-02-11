-- Allow conversation participants to delete messages (for the delete feature)
CREATE POLICY "Participants can delete messages in their conversations"
ON public.messages
FOR DELETE
USING (is_conversation_participant(auth.uid(), conversation_id));