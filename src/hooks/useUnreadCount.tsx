import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export function useUnreadCount() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["unread-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      const { data: participations } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);

      if (!participations?.length) return 0;

      let total = 0;
      for (const p of participations) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", p.conversation_id)
          .neq("sender_id", user.id)
          .gt("created_at", p.last_read_at || "1970-01-01");
        total += count || 0;
      }

      return total;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  // Realtime refresh on new messages
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("unread-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
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
