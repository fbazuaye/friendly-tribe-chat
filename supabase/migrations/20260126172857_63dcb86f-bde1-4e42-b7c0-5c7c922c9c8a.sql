-- Fix the user_roles INSERT policy - the old policy had a bug comparing organization_id to itself
DROP POLICY IF EXISTS "Users can create their initial user role" ON public.user_roles;

CREATE POLICY "Users can create their initial user role"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    (user_id = auth.uid()) 
    AND (role = 'user'::app_role) 
    AND (NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.organization_id = user_roles.organization_id
    ))
  );