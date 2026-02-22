import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PushSubscriptionState {
  supported: boolean;
  permission: NotificationPermission | null;
  enabled: boolean;
}

export function usePushNotifications(totalUnreadCount?: number) {
  const { user } = useAuth();
  const mountedRef = useRef(true);
  const subscribedRef = useRef(false);
  const [subscription, setSubscription] = useState<PushSubscriptionState>({
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

  // Save push subscription to database
  const savePushSubscription = useCallback(async (pushSub: PushSubscription) => {
    if (!user?.id) return;

    const subJson = pushSub.toJSON();
    const endpoint = subJson.endpoint!;
    const p256dh = subJson.keys?.p256dh || '';
    const auth = subJson.keys?.auth || '';

    try {
      // Upsert the subscription
      const { error } = await supabase
        .from('push_subscriptions' as any)
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' }
        );

      if (error) {
        console.error('Error saving push subscription:', error);
      } else {
        console.log('Push subscription saved successfully');
      }
    } catch (err) {
      console.error('Error saving push subscription:', err);
    }
  }, [user?.id]);

  // Subscribe to Web Push when permission is granted
  const subscribeToPush = useCallback(async () => {
    if (subscribedRef.current || !user?.id) return;

    try {
      const registration = await navigator.serviceWorker.ready as any;

      // VAPID public key (this is a public key, safe to include in client code)
      const vapidPublicKey = 'BN3SiZm-WYOC8fVE0t11GE8q0NVvo4nokdPPiWbDR4KjmK2srt0KjHuINTBe8KBx56ZlGjoEZW5ljDXUcAWp5W0';

      // Convert base64url VAPID key to Uint8Array
      const padding = '='.repeat((4 - (vapidPublicKey.length % 4)) % 4);
      const base64 = (vapidPublicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const applicationServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }

      // Check for existing subscription
      let pushSub = await registration.pushManager.getSubscription();

      if (pushSub) {
        // Verify the existing subscription uses the correct VAPID key
        const existingKey = pushSub.options?.applicationServerKey;
        if (existingKey) {
          const existingKeyArray = new Uint8Array(existingKey);
          const keysMatch = existingKeyArray.length === applicationServerKey.length &&
            existingKeyArray.every((v: number, i: number) => v === applicationServerKey[i]);
          if (!keysMatch) {
            console.log('VAPID key mismatch detected, re-subscribing...');
            await pushSub.unsubscribe();
            pushSub = null;
          }
        }
      }

      if (!pushSub) {
        pushSub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      await savePushSubscription(pushSub);
      subscribedRef.current = true;
    } catch (err) {
      console.error('Failed to subscribe to push:', err);
    }
  }, [user?.id, savePushSubscription]);

  // Auto-subscribe when permission is granted
  useEffect(() => {
    if (subscription.enabled && user?.id) {
      subscribeToPush();
    }
  }, [subscription.enabled, user?.id, subscribeToPush]);

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

  return {
    ...subscription,
    requestPermission,
    showNotification,
  };
}
