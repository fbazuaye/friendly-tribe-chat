-- Allow users to create their own initial 'user' role when joining an organization
-- This only permits inserting a 'user' role for themselves, not admin/moderator roles
CREATE POLICY "Users can create their initial user role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'user'::app_role
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND organization_id = user_roles.organization_id
  )
);