
CREATE POLICY "Users can update their own subscription"
ON public.broadcast_subscribers
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
