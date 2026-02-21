import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Community {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  member_count: number;
  is_admin: boolean;
  unread: number;
}

interface CommunityMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useCommunities() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["communities"],
    queryFn: async () => {
      if (!user) return [];

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.organization_id) return [];

      // Get communities in the org
      const { data: communities, error } = await supabase
        .from("communities")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      if (!communities?.length) return [];

      // Get membership info for current user
      const { data: memberships } = await supabase
        .from("community_members")
        .select("community_id, role, last_read_at")
        .eq("user_id", user.id);

      const membershipMap = new Map(
        memberships?.map((m) => [m.community_id, m]) || []
      );

      // Get member counts - query all members for communities user is part of
      const joinedIds = memberships?.map((m) => m.community_id) || [];

      const result: Community[] = [];
      for (const c of communities) {
        const membership = membershipMap.get(c.id);
        if (!membership) continue; // Only show communities user is a member of

        // Count members
        const { count } = await supabase
          .from("community_members")
          .select("id", { count: "exact", head: true })
          .eq("community_id", c.id);

        // Count unread messages
        let unread = 0;
        if (membership.last_read_at) {
          const { count: unreadCount } = await supabase
            .from("community_messages")
            .select("id", { count: "exact", head: true })
            .eq("community_id", c.id)
            .gt("created_at", membership.last_read_at);
          unread = unreadCount || 0;
        }

        result.push({
          id: c.id,
          name: c.name,
          description: c.description,
          avatar_url: c.avatar_url,
          organization_id: c.organization_id,
          created_by: c.created_by,
          created_at: c.created_at,
          member_count: count || 0,
          is_admin: membership.role === "admin",
          unread,
        });
      }

      return result;
    },
    enabled: !!user,
  });
}

export function useCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ["community-members", communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data: members, error } = await supabase
        .from("community_members")
        .select("*")
        .eq("community_id", communityId);

      if (error) throw error;

      const userIds = members?.map((m) => m.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return (members || []).map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id),
      })) as CommunityMember[];
    },
    enabled: !!communityId,
  });
}

export function useCommunityMessages(communityId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["community-messages", communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data: messages, error } = await supabase
        .from("community_messages")
        .select("*")
        .eq("community_id", communityId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const senderIds = [...new Set(messages?.map((m) => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", senderIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return (messages || []).map((m) => ({
        ...m,
        sender: profileMap.get(m.sender_id),
      }));
    },
    enabled: !!communityId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!communityId) return;

    const channel = supabase
      .channel(`community-messages:${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `community_id=eq.${communityId}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .eq("id", newMsg.sender_id)
            .single();

          queryClient.setQueryData(
            ["community-messages", communityId],
            (old: any[] | undefined) => {
              if (!old) return [{ ...newMsg, sender: profile }];
              if (old.some((m) => m.id === newMsg.id)) return old;
              return [...old, { ...newMsg, sender: profile }];
            }
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "community_messages",
          filter: `community_id=eq.${communityId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          queryClient.setQueryData(
            ["community-messages", communityId],
            (old: any[] | undefined) => old?.filter((m) => m.id !== deletedId)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId, queryClient]);

  // Mark as read
  useEffect(() => {
    if (!communityId || !user?.id) return;

    supabase
      .from("community_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("community_id", communityId)
      .eq("user_id", user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["communities"] });
      });
  }, [communityId, user?.id]);

  return query;
}

export function useCreateCommunity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      name,
      description,
      memberIds,
    }: {
      name: string;
      description?: string;
      memberIds: string[];
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Get user's org
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.organization_id) throw new Error("No organization");

      // Create community
      const { data: community, error } = await supabase
        .from("communities")
        .insert({
          name,
          description: description || null,
          organization_id: profile.organization_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin
      await supabase.from("community_members").insert({
        community_id: community.id,
        user_id: user.id,
        role: "admin",
      });

      // Add selected members
      if (memberIds.length > 0) {
        const memberInserts = memberIds
          .filter((id) => id !== user.id)
          .map((id) => ({
            community_id: community.id,
            user_id: id,
            role: "member" as const,
          }));

        if (memberInserts.length > 0) {
          await supabase.from("community_members").insert(memberInserts);
        }
      }

      return community;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
  });
}

export function useSendCommunityMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      communityId,
      content,
    }: {
      communityId: string;
      content: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("community_messages")
        .insert({
          community_id: communityId,
          sender_id: user.id,
          content,
          message_type: "text",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["community-messages", data.community_id],
      });
      queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
  });
}
