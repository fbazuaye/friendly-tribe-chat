import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PushSubscription {
  supported: boolean;
  permission: NotificationPermission | null;
  enabled: boolean;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<PushSubscription>({
    supported: false,
    permission: null,
    enabled: false,
  });

  useEffect(() => {
    // Check if push notifications are supported
    const supported =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    if (supported) {
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
      setSubscription((prev) => ({
        ...prev,
        permission,
        enabled: permission === "granted",
      }));
      return permission === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [subscription.supported]);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!subscription.enabled) return;

      // Use service worker to show notification if app is in background
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          payload: { title, ...options },
        });
      } else {
        // Fallback to direct notification
        new Notification(title, options);
      }
    },
    [subscription.enabled]
  );

  // Subscribe to new messages for notifications
  useEffect(() => {
    if (!user?.id || !subscription.enabled) return;

    // Listen for new messages not from the current user
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

          // Don't notify for own messages
          if (newMessage.sender_id === user.id) return;

          // Check if the user is a participant in this conversation
          const { data: participant } = await supabase
            .from("conversation_participants")
            .select("id")
            .eq("conversation_id", newMessage.conversation_id)
            .eq("user_id", user.id)
            .single();

          if (!participant) return;

          // Check if page is hidden (app in background)
          if (document.hidden) {
            // Get sender name
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
