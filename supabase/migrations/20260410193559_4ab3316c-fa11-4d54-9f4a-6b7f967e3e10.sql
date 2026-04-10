
-- Step 1: Performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON public.community_members (community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user_id ON public.community_members (user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community_user ON public.community_members (community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_subscribers_channel_id ON public.broadcast_subscribers (channel_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_subscribers_user_id ON public.broadcast_subscribers (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_messages_community_id_created ON public.community_messages (community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON public.conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_channel_id_created ON public.broadcast_messages (channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_org_user ON public.user_roles (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_token_allocations_org_user ON public.user_token_allocations (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions (user_id);

-- Step 7: Add member_count to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 0;

-- Initialize member_count from existing data
UPDATE public.organizations o
SET member_count = (
  SELECT COUNT(*) FROM public.profiles p WHERE p.organization_id = o.id
);

-- Trigger function to maintain member_count
CREATE OR REPLACE FUNCTION public.update_org_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NOT NULL THEN
    UPDATE public.organizations SET member_count = member_count + 1 WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' AND OLD.organization_id IS NOT NULL THEN
    UPDATE public.organizations SET member_count = member_count - 1 WHERE id = OLD.organization_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      IF OLD.organization_id IS NOT NULL THEN
        UPDATE public.organizations SET member_count = member_count - 1 WHERE id = OLD.organization_id;
      END IF;
      IF NEW.organization_id IS NOT NULL THEN
        UPDATE public.organizations SET member_count = member_count + 1 WHERE id = NEW.organization_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_org_member_count
AFTER INSERT OR UPDATE OF organization_id OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_org_member_count();

-- Step 5: Function to get all unread community counts in one query
CREATE OR REPLACE FUNCTION public.get_unread_community_counts(_user_id uuid)
RETURNS TABLE(community_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cm.community_id,
    COUNT(msg.id) AS unread_count
  FROM public.community_members cm
  LEFT JOIN public.community_messages msg
    ON msg.community_id = cm.community_id
    AND msg.sender_id != _user_id
    AND msg.created_at > COALESCE(cm.last_read_at, cm.joined_at)
  WHERE cm.user_id = _user_id
  GROUP BY cm.community_id
$$;

-- Step 2: Function for paginated org users with search
CREATE OR REPLACE FUNCTION public.get_org_users_paginated(
  _org_id uuid,
  _search text DEFAULT '',
  _page_size integer DEFAULT 50,
  _page_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  display_name text,
  avatar_url text,
  phone text,
  last_seen_at timestamptz,
  created_at timestamptz,
  role text,
  current_balance integer,
  monthly_quota integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.phone,
    p.last_seen_at,
    p.created_at,
    COALESCE(ur.role::text, 'user') AS role,
    COALESCE(uta.current_balance, 0) AS current_balance,
    COALESCE(uta.monthly_quota, 0) AS monthly_quota
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.organization_id = _org_id
  LEFT JOIN public.user_token_allocations uta ON uta.user_id = p.id AND uta.organization_id = _org_id
  WHERE p.organization_id = _org_id
    AND (_search = '' OR p.display_name ILIKE '%' || _search || '%' OR p.phone ILIKE '%' || _search || '%')
  ORDER BY p.created_at DESC
  LIMIT _page_size
  OFFSET _page_offset
$$;
