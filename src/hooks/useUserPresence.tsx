import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OnlineUser {
  id: string;
  display_name: string | null;
  online_at: string;
}

export function useUserPresence() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSeenUpdateRef = useRef<NodeJS.Timeout | null>(null);

  const updateLastSeen = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channelName = `presence:global`;
    
    channelRef.current = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channelRef.current
      .on("presence", { event: "sync" }, () => {
        const state = channelRef.current?.presenceState() ?? {};
        const users = new Map<string, OnlineUser>();
        
        Object.entries(state).forEach(([userId, presences]) => {
          if (presences && presences.length > 0) {
            const presence = presences[0] as unknown as OnlineUser;
            if (presence.id) {
              users.set(userId, presence);
            }
          }
        });
        
        setOnlineUsers(users);
      })
      .on("presence", { event: "leave" }, async ({ key }) => {
        // When a user leaves, update their last_seen_at
        if (key && key !== user.id) {
          // The leaving user's last_seen is updated by their own client
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Track this user's presence
          await channelRef.current?.track({
            id: user.id,
            display_name: user.user_metadata?.display_name || user.email?.split("@")[0],
            online_at: new Date().toISOString(),
          });
          
          // Update last_seen periodically while online
          updateLastSeen();
        }
      });

    // Update last_seen every 60 seconds while online
    lastSeenUpdateRef.current = setInterval(updateLastSeen, 60000);

    // Update last_seen when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        channelRef.current?.track({
          id: user.id,
          display_name: user.user_metadata?.display_name || user.email?.split("@")[0],
          online_at: new Date().toISOString(),
        });
        updateLastSeen();
      }
    };

    // Update last_seen before page unload
    const handleBeforeUnload = () => {
      updateLastSeen();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      if (lastSeenUpdateRef.current) {
        clearInterval(lastSeenUpdateRef.current);
      }
      
      // Update last_seen on cleanup
      updateLastSeen();
      
      channelRef.current?.unsubscribe();
    };
  }, [user?.id, updateLastSeen]);

  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  const getOnlineUserIds = useCallback((): string[] => {
    return Array.from(onlineUsers.keys());
  }, [onlineUsers]);

  return {
    onlineUsers,
    isUserOnline,
    getOnlineUserIds,
  };
}

// Context provider to share presence across components
import { createContext, useContext, ReactNode } from "react";

interface PresenceContextType {
  onlineUsers: Map<string, OnlineUser>;
  isUserOnline: (userId: string) => boolean;
  getOnlineUserIds: () => string[];
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const presence = useUserPresence();
  
  return (
    <PresenceContext.Provider value={presence}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const context = useContext(PresenceContext);
  if (context === undefined) {
    throw new Error("usePresence must be used within a PresenceProvider");
  }
  return context;
}
