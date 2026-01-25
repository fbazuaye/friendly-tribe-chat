-- Phase 1: Enums for role and transaction types
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'moderator', 'user');

CREATE TYPE public.token_transaction_type AS ENUM (
  'purchase',
  'allocation',
  'revocation',
  'consumption',
  'expiration',
  'monthly_reset'
);

CREATE TYPE public.token_action_type AS ENUM (
  'message_text',
  'message_media',
  'ai_summary',
  'ai_smart_reply',
  'ai_moderation',
  'ai_analytics',
  'broadcast',
  'voice_note',
  'file_share'
);

-- Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization wallets (central token pool)
CREATE TABLE public.organization_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  tokens_purchased INTEGER NOT NULL DEFAULT 0,
  tokens_allocated INTEGER NOT NULL DEFAULT 0,
  tokens_consumed INTEGER NOT NULL DEFAULT 0,
  last_purchase_at TIMESTAMPTZ,
  tokens_expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate for security - prevents privilege escalation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- User token allocations (sub-wallets)
CREATE TABLE public.user_token_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  monthly_quota INTEGER NOT NULL DEFAULT 0,
  current_balance INTEGER NOT NULL DEFAULT 0,
  allocated_by UUID REFERENCES auth.users(id),
  quota_reset_day INTEGER DEFAULT 1,
  last_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- Token transactions (immutable audit log)
CREATE TABLE public.token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  transaction_type public.token_transaction_type NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER,
  balance_after INTEGER,
  action_type public.token_action_type,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Token action costs configuration
CREATE TABLE public.token_action_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type public.token_action_type NOT NULL,
  token_cost INTEGER NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  admin_only BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, action_type)
);

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_token_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_action_costs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = _role
  )
$$;

-- Function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _org_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1
$$;

-- Function to check if user has sufficient token balance
CREATE OR REPLACE FUNCTION public.check_token_balance(_user_id UUID, _org_id UUID, _required INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(current_balance >= _required, false)
  FROM public.user_token_allocations
  WHERE user_id = _user_id AND organization_id = _org_id
$$;

-- Function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('admin', 'super_admin')
  )
$$;

-- Function to get user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- RLS Policies for organizations
CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Super admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (public.has_role(auth.uid(), id, 'super_admin'));

-- RLS Policies for organization_wallets
CREATE POLICY "Admins can view organization wallet"
  ON public.organization_wallets FOR SELECT
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Super admins can update organization wallet"
  ON public.organization_wallets FOR UPDATE
  USING (public.has_role(auth.uid(), organization_id, 'super_admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their organization"
  ON public.profiles FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()) OR id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their organization"
  ON public.user_roles FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), organization_id, 'super_admin'));

-- RLS Policies for user_token_allocations
CREATE POLICY "Users can view their own allocation"
  ON public.user_token_allocations FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can manage allocations"
  ON public.user_token_allocations FOR ALL
  USING (public.is_org_admin(auth.uid(), organization_id));

-- RLS Policies for token_transactions
CREATE POLICY "Users can view their own transactions"
  ON public.token_transactions FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "System can insert transactions"
  ON public.token_transactions FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id));

-- RLS Policies for token_action_costs
CREATE POLICY "Users can view action costs"
  ON public.token_action_costs FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()) OR organization_id IS NULL);

CREATE POLICY "Super admins can manage action costs"
  ON public.token_action_costs FOR ALL
  USING (public.has_role(auth.uid(), organization_id, 'super_admin'));

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_wallets_updated_at
  BEFORE UPDATE ON public.organization_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_token_allocations_updated_at
  BEFORE UPDATE ON public.user_token_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default token action costs (global defaults)
INSERT INTO public.token_action_costs (organization_id, action_type, token_cost, is_enabled, admin_only) VALUES
  (NULL, 'message_text', 1, true, false),
  (NULL, 'message_media', 3, true, false),
  (NULL, 'voice_note', 5, true, false),
  (NULL, 'ai_smart_reply', 5, true, false),
  (NULL, 'ai_summary', 15, true, true),
  (NULL, 'ai_moderation', 10, true, true),
  (NULL, 'ai_analytics', 20, true, true),
  (NULL, 'broadcast', 20, true, true),
  (NULL, 'file_share', 2, true, false);