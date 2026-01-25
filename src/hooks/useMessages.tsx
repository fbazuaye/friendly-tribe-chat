import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  is_read: boolean;
  sender?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useMessages(conversationId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Get sender profiles
      const senderIds = [...new Set(messages?.map((m) => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", senderIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]));

      return (messages || []).map((m) => ({
        ...m,
        sender: profileMap.get(m.sender_id),
      })) as Message[];
    },
    enabled: !!conversationId,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          // Get sender profile
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .eq("id", newMessage.sender_id)
            .single();

          const messageWithSender = {
            ...newMessage,
            sender: senderProfile || undefined,
          };

          queryClient.setQueryData(
            ["messages", conversationId],
            (old: Message[] | undefined) => {
              if (!old) return [messageWithSender];
              // Avoid duplicates
              if (old.some((m) => m.id === newMessage.id)) return old;
              return [...old, messageWithSender];
            }
          );

          // Also invalidate conversations to update last message
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Mark as read when viewing
  useEffect(() => {
    if (!conversationId || !user?.id) return;

    const markAsRead = async () => {
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
    };

    markAsRead();
  }, [conversationId, user?.id]);

  return query;
}

interface SendMessageParams {
  conversationId?: string;
  recipientId?: string;
  content: string;
  messageType?: "text" | "media" | "voice";
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, recipientId, content, messageType = "text" }: SendMessageParams) => {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          conversation_id: conversationId,
          recipient_id: recipientId,
          content,
          message_type: messageType,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["messages", data.conversation_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["token-balance"] });
    },
  });
}
