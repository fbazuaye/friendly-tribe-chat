import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export function useUnreadCommunityCount() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["unread-community-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      const { data: memberships } = await supabase
        .from("community_members")
        .select("community_id, last_read_at, joined_at")
        .eq("user_id", user.id);

      if (!memberships?.length) return 0;

      let total = 0;
      for (const mem of memberships) {
        const cutoff = mem.last_read_at || mem.joined_at;
        const { count } = await supabase
          .from("community_messages")
          .select("*", { count: "exact", head: true })
          .eq("community_id", mem.community_id)
          .neq("sender_id", user.id)
          .gt("created_at", cutoff);
        total += count || 0;
      }

      return total;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("unread-community-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
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
