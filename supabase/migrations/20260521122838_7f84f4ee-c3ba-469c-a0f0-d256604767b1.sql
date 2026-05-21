
-- 1) Restrict organizations SELECT to user's own org
DROP POLICY IF EXISTS "Authenticated users can view organizations" ON public.organizations;

CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = public.get_user_org_id(auth.uid()));

-- 2) SECURITY DEFINER RPC for invite-code lookup (no invite_code leak)
CREATE OR REPLACE FUNCTION public.find_organization_by_invite_code(_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name
  FROM public.organizations o
  WHERE o.invite_code = _code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_organization_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_organization_by_invite_code(text) TO authenticated;

-- 3) Restrict sms_contacts SELECT to admins only
DROP POLICY IF EXISTS "Org members can view SMS contacts" ON public.sms_contacts;
