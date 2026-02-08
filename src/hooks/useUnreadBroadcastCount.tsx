import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export function useUnreadBroadcastCount() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["unread-broadcast-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      // Get channels the user is subscribed to with their subscription time
      const { data: subscriptions } = await supabase
        .from("broadcast_subscribers")
        .select("channel_id, subscribed_at")
        .eq("user_id", user.id);

      if (!subscriptions?.length) return 0;

      // For now, count broadcast messages from the last 24 hours
      // that were sent after the user subscribed
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let total = 0;
      for (const sub of subscriptions) {
        const cutoff = sub.subscribed_at > oneDayAgo ? sub.subscribed_at : oneDayAgo;
        const { count } = await supabase
          .from("broadcast_messages")
          .select("*", { count: "exact", head: true })
          .eq("channel_id", sub.channel_id)
          .gt("created_at", cutoff);
        total += count || 0;
      }

      return total;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Realtime refresh on new broadcast messages
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("unread-broadcast-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "broadcast_messages" },
        () => {
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return query.data || 0;
}
