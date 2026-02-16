import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PushSubscription {
  supported: boolean;
  permission: NotificationPermission | null;
  enabled: boolean;
}

export function usePushNotifications(totalUnreadCount?: number) {
  const { user } = useAuth();
  const mountedRef = useRef(true);
  const [subscription, setSubscription] = useState<PushSubscription>({
    supported: false,
    permission: null,
    enabled: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const supported =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    if (supported && mountedRef.current) {
      setSubscription((prev) => ({
        ...prev,
        supported: true,
        permission: Notification.permission,
        enabled: Notification.permission === "granted",
      }));
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!subscription.supported) return false;

    try {
      const permission = await Notification.requestPermission();
      if (mountedRef.current) {
        setSubscription((prev) => ({
          ...prev,
          permission,
          enabled: permission === "granted",
        }));
      }
      return permission === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [subscription.supported]);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!subscription.enabled) return;

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          payload: { title, ...options },
        });
      } else {
        new Notification(title, options);
      }
    },
    [subscription.enabled]
  );

  // Set app badge count
  const setBadgeCount = useCallback((count: number) => {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_BADGE',
        count,
      });
    }
  }, []);

  // Sync badge with real unread count from database
  useEffect(() => {
    if (totalUnreadCount !== undefined) {
      setBadgeCount(totalUnreadCount);
    }
  }, [totalUnreadCount, setBadgeCount]);

  // Subscribe to new messages for push notifications (not badge - badge is now driven by totalUnreadCount)
  useEffect(() => {
    if (!user?.id || !subscription.enabled) return;

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            sender_id: string;
            content: string;
            conversation_id: string;
          };

          if (newMessage.sender_id === user.id) return;

          const { data: participant } = await supabase
            .from("conversation_participants")
            .select("id")
            .eq("conversation_id", newMessage.conversation_id)
            .eq("user_id", user.id)
            .single();

          if (!participant) return;

          if (document.hidden) {
            const { data: sender } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", newMessage.sender_id)
              .single();

            showNotification(sender?.display_name || "New message", {
              body: newMessage.content.slice(0, 100),
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: newMessage.conversation_id,
              data: {
                url: `/chat/${newMessage.conversation_id}`,
              },
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "broadcast_messages",
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            sender_id: string;
            content: string;
            channel_id: string;
          };

          if (newMsg.sender_id === user.id) return;

          const { data: sub } = await supabase
            .from("broadcast_subscribers")
            .select("id")
            .eq("channel_id", newMsg.channel_id)
            .eq("user_id", user.id)
            .single();

          if (!sub) return;

          if (document.hidden) {
            const { data: channel } = await supabase
              .from("broadcast_channels")
              .select("name")
              .eq("id", newMsg.channel_id)
              .single();

            showNotification(channel?.name || "Broadcast", {
              body: newMsg.content.slice(0, 100),
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: `broadcast-${newMsg.channel_id}`,
              data: {
                url: `/broadcasts/${newMsg.channel_id}`,
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, subscription.enabled, showNotification]);

  return {
    ...subscription,
    requestPermission,
    showNotification,
  };
}
