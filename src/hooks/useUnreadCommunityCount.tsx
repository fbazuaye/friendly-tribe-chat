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

      const { data, error } = await supabase.rpc("get_unread_community_counts", {
        _user_id: user.id,
      });

      if (error) {
        console.error("Error fetching unread community counts:", error);
        return 0;
      }

      return (data || []).reduce(
        (sum: number, row: { unread_count: number }) => sum + (row.unread_count || 0),
        0
      );
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
