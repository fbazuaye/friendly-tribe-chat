-- Add invite_code column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN invite_code TEXT UNIQUE;

-- Generate a code for the existing organization
UPDATE public.organizations 
SET invite_code = 'LIVEGIG2026' 
WHERE name = 'LiveGig Organization';

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;

-- Create a new policy that allows authenticated users to read organizations
-- (needed for invite code lookup)
CREATE POLICY "Authenticated users can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (true);