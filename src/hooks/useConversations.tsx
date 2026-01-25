import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Conversation {
  id: string;
  organization_id: string;
  is_group: boolean;
  name: string | null;
  created_at: string;
  updated_at: string;
  participants: Array<{
    user_id: string;
    profile?: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      last_seen_at?: string | null;
    };
  }>;
  last_message?: {
    content: string;
    created_at: string;
    sender_id: string;
  };
  unread_count?: number;
}

export function useConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get user's conversations
      const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (partError) throw partError;
      if (!participations?.length) return [];

      const conversationIds = participations.map((p) => p.conversation_id);

      // Get conversations with participants
      const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .in("id", conversationIds)
        .order("updated_at", { ascending: false });

      if (convError) throw convError;

      // Get participants for each conversation
      const result: Conversation[] = await Promise.all(
        (conversations || []).map(async (conv) => {
          const { data: participants } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", conv.id);

          // Fetch all participant profiles in a single query
          const participantIds = (participants || []).map((p) => p.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", participantIds);

          const profileMap = new Map(
            (profiles || []).map((p) => [p.id, p])
          );

          const participantProfiles = participantIds.map((userId) => ({
            user_id: userId,
            profile: profileMap.get(userId) || undefined,
          }));

          // Get last message
          const { data: messages } = await supabase
            .from("messages")
            .select("content, created_at, sender_id")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1);

          // Get unread count
          const { data: myParticipation } = await supabase
            .from("conversation_participants")
            .select("last_read_at")
            .eq("conversation_id", conv.id)
            .eq("user_id", user.id)
            .single();

          let unreadCount = 0;
          if (myParticipation) {
            const { count } = await supabase
              .from("messages")
              .select("*", { count: "exact", head: true })
              .eq("conversation_id", conv.id)
              .neq("sender_id", user.id)
              .gt("created_at", myParticipation.last_read_at || "1970-01-01");
            unreadCount = count || 0;
          }

          return {
            ...conv,
            participants: participantProfiles,
            last_message: messages?.[0],
            unread_count: unreadCount,
          };
        })
      );

      return result;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
}

export function useConversation(conversationId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId || !user?.id) return null;

      const { data: conv, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (error) throw error;

      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId);

      // Fetch all participant profiles in a single query
      const participantIds = (participants || []).map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, last_seen_at")
        .in("id", participantIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p])
      );

      const participantProfiles = participantIds.map((userId) => ({
        user_id: userId,
        profile: profileMap.get(userId) || undefined,
      }));

      return {
        ...conv,
        participants: participantProfiles,
      } as Conversation;
    },
    enabled: !!conversationId && !!user?.id,
  });
}

export function useOrganizationMembers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["organization-members", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get user's org
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!myProfile?.organization_id) return [];

      // Get all members in org
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("organization_id", myProfile.organization_id)
        .neq("id", user.id);

      if (error) throw error;
      return profiles || [];
    },
    enabled: !!user?.id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipientId: string) => {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          recipient_id: recipientId,
          content: "Started a conversation",
          message_type: "text",
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
