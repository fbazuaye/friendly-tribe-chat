-- Allow users to subscribe themselves to channels in their organization
CREATE POLICY "Users can subscribe to org channels"
  ON public.broadcast_subscribers FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND 
    EXISTS (
      SELECT 1 FROM public.broadcast_channels bc
      WHERE bc.id = channel_id 
      AND bc.organization_id = get_user_org_id(auth.uid())
    )
  );