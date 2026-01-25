-- Conversations table for 1:1 and group chats
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_group BOOLEAN DEFAULT false,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation participants
CREATE TABLE public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read BOOLEAN DEFAULT false
);

-- Broadcast channels
CREATE TABLE public.broadcast_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Broadcast subscribers
CREATE TABLE public.broadcast_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.broadcast_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Broadcast messages
CREATE TABLE public.broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.broadcast_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is participant in conversation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id UUID, _conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id
  )
$$;

-- Helper function to check if user is broadcast channel owner
CREATE OR REPLACE FUNCTION public.is_channel_owner(_user_id UUID, _channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.broadcast_channels
    WHERE owner_id = _user_id AND id = _channel_id
  )
$$;

-- Helper function to check if user is subscribed to channel
CREATE OR REPLACE FUNCTION public.is_channel_subscriber(_user_id UUID, _channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.broadcast_subscribers
    WHERE user_id = _user_id AND channel_id = _channel_id
  )
$$;

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations they participate in"
ON public.conversations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can create conversations in their org"
ON public.conversations FOR INSERT
WITH CHECK (organization_id = get_user_org_id(auth.uid()));

-- RLS Policies for conversation_participants
CREATE POLICY "Users can view participants of their conversations"
ON public.conversation_participants FOR SELECT
USING (is_conversation_participant(auth.uid(), conversation_id));

CREATE POLICY "Users can add participants to conversations they're in"
ON public.conversation_participants FOR INSERT
WITH CHECK (is_conversation_participant(auth.uid(), conversation_id) OR user_id = auth.uid());

CREATE POLICY "Users can update their own participant record"
ON public.conversation_participants FOR UPDATE
USING (user_id = auth.uid());

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
USING (is_conversation_participant(auth.uid(), conversation_id));

CREATE POLICY "Users can send messages to their conversations"
ON public.messages FOR INSERT
WITH CHECK (
  is_conversation_participant(auth.uid(), conversation_id) 
  AND sender_id = auth.uid()
);

CREATE POLICY "Users can update their own messages"
ON public.messages FOR UPDATE
USING (sender_id = auth.uid());

-- RLS Policies for broadcast_channels
CREATE POLICY "Users can view channels in their org"
ON public.broadcast_channels FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can create broadcast channels"
ON public.broadcast_channels FOR INSERT
WITH CHECK (
  organization_id = get_user_org_id(auth.uid()) 
  AND is_org_admin(auth.uid(), organization_id)
  AND owner_id = auth.uid()
);

CREATE POLICY "Channel owners can update their channels"
ON public.broadcast_channels FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Channel owners can delete their channels"
ON public.broadcast_channels FOR DELETE
USING (owner_id = auth.uid());

-- RLS Policies for broadcast_subscribers
CREATE POLICY "Users can view subscribers of channels they own or subscribe to"
ON public.broadcast_subscribers FOR SELECT
USING (
  is_channel_owner(auth.uid(), channel_id) 
  OR user_id = auth.uid()
);

CREATE POLICY "Channel owners can manage subscribers"
ON public.broadcast_subscribers FOR INSERT
WITH CHECK (is_channel_owner(auth.uid(), channel_id));

CREATE POLICY "Users can unsubscribe themselves"
ON public.broadcast_subscribers FOR DELETE
USING (user_id = auth.uid() OR is_channel_owner(auth.uid(), channel_id));

-- RLS Policies for broadcast_messages
CREATE POLICY "Subscribers can view broadcast messages"
ON public.broadcast_messages FOR SELECT
USING (
  is_channel_subscriber(auth.uid(), channel_id) 
  OR is_channel_owner(auth.uid(), channel_id)
);

CREATE POLICY "Channel owners can send broadcast messages"
ON public.broadcast_messages FOR INSERT
WITH CHECK (
  is_channel_owner(auth.uid(), channel_id) 
  AND sender_id = auth.uid()
);

-- Updated at triggers
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_broadcast_channels_updated_at
BEFORE UPDATE ON public.broadcast_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_messages;