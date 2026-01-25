import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TypingUser {
  id: string;
  display_name: string | null;
}

export function useTypingIndicator(conversationId: string | undefined) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!conversationId || !user?.id) return;

    // Create presence channel for this conversation
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const typing: TypingUser[] = [];

        Object.entries(presenceState).forEach(([userId, presences]) => {
          if (userId !== user.id) {
            const presence = presences[0] as { typing?: boolean; display_name?: string };
            if (presence?.typing) {
              typing.push({
                id: userId,
                display_name: presence.display_name || null,
              });
            }
          }
        });

        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Track initial presence (not typing)
          await channel.track({
            typing: false,
            display_name: null,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, user?.id]);

  const setTyping = useCallback(
    async (displayName: string | null = null) => {
      if (!channelRef.current || !user?.id) return;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Update typing status if not already typing
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        await channelRef.current.track({
          typing: true,
          display_name: displayName,
          online_at: new Date().toISOString(),
        });
      }

      // Auto-clear typing after 3 seconds of no input
      typingTimeoutRef.current = setTimeout(async () => {
        isTypingRef.current = false;
        await channelRef.current?.track({
          typing: false,
          display_name: displayName,
          online_at: new Date().toISOString(),
        });
      }, 3000);
    },
    [user?.id]
  );

  const clearTyping = useCallback(async () => {
    if (!channelRef.current) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    isTypingRef.current = false;
    await channelRef.current.track({
      typing: false,
      display_name: null,
      online_at: new Date().toISOString(),
    });
  }, []);

  return {
    typingUsers,
    setTyping,
    clearTyping,
  };
}
