
-- Table to store SMS contacts per organization
CREATE TABLE public.sms_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, phone_number)
);

ALTER TABLE public.sms_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage SMS contacts"
  ON public.sms_contacts
  FOR ALL
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org members can view SMS contacts"
  ON public.sms_contacts
  FOR SELECT
  USING (public.get_user_org_id(auth.uid()) = organization_id);

-- Table to log bulk SMS sends
CREATE TABLE public.sms_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  response_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage SMS logs"
  ON public.sms_logs
  FOR ALL
  USING (public.is_org_admin(auth.uid(), organization_id));
