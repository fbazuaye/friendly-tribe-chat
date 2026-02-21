
-- Communities table
CREATE TABLE public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Community members table
CREATE TABLE public.community_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_read_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(community_id, user_id)
);

-- Community messages table
CREATE TABLE public.community_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Security definer function to check community membership
CREATE OR REPLACE FUNCTION public.is_community_member(_user_id UUID, _community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE user_id = _user_id AND community_id = _community_id
  )
$$;

-- Security definer function to check community admin
CREATE OR REPLACE FUNCTION public.is_community_admin(_user_id UUID, _community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE user_id = _user_id AND community_id = _community_id AND role = 'admin'
  )
$$;

-- Communities policies
CREATE POLICY "Org members can view communities" ON public.communities
FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org members can create communities" ON public.communities
FOR INSERT WITH CHECK (
  organization_id = get_user_org_id(auth.uid()) AND created_by = auth.uid()
);

CREATE POLICY "Community admins can update" ON public.communities
FOR UPDATE USING (is_community_admin(auth.uid(), id));

CREATE POLICY "Community admins can delete" ON public.communities
FOR DELETE USING (is_community_admin(auth.uid(), id));

-- Community members policies
CREATE POLICY "Members can view community members" ON public.community_members
FOR SELECT USING (is_community_member(auth.uid(), community_id));

CREATE POLICY "Community admins can add members" ON public.community_members
FOR INSERT WITH CHECK (
  is_community_admin(auth.uid(), community_id) OR user_id = auth.uid()
);

CREATE POLICY "Community admins can remove members" ON public.community_members
FOR DELETE USING (
  is_community_admin(auth.uid(), community_id) OR user_id = auth.uid()
);

CREATE POLICY "Members can update their own record" ON public.community_members
FOR UPDATE USING (user_id = auth.uid());

-- Community messages policies
CREATE POLICY "Members can view community messages" ON public.community_messages
FOR SELECT USING (is_community_member(auth.uid(), community_id));

CREATE POLICY "Members can send community messages" ON public.community_messages
FOR INSERT WITH CHECK (
  is_community_member(auth.uid(), community_id) AND sender_id = auth.uid()
);

CREATE POLICY "Members can delete their own messages" ON public.community_messages
FOR DELETE USING (
  sender_id = auth.uid() OR is_community_admin(auth.uid(), community_id)
);

CREATE POLICY "Members can update their own messages" ON public.community_messages
FOR UPDATE USING (sender_id = auth.uid());

-- Enable realtime for community messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;

-- Indexes
CREATE INDEX idx_community_members_community ON public.community_members(community_id);
CREATE INDEX idx_community_members_user ON public.community_members(user_id);
CREATE INDEX idx_community_messages_community ON public.community_messages(community_id);
CREATE INDEX idx_community_messages_created ON public.community_messages(created_at);
CREATE INDEX idx_communities_org ON public.communities(organization_id);
