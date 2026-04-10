import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface OrganizationUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  current_balance: number;
  monthly_quota: number;
  allocation_id: string | null;
}

interface UseOrganizationUsersOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

export function useOrganizationUsers(options: UseOrganizationUsersOptions = {}) {
  const { page = 0, pageSize = 50, search = "" } = options;
  const { user } = useAuth();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.organization_id) {
        setLoading(false);
        return;
      }

      const orgId = profile.organization_id;

      // Get total count
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      setTotalCount(count || 0);

      // Paginated profiles with optional search
      let query = supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (search) {
        query = query.or(`display_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data: profiles, error: profilesError } = await query;
      if (profilesError) throw profilesError;

      const userIds = profiles?.map((p) => p.id) || [];
      if (userIds.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Fetch roles and allocations only for this page's users
      const [rolesRes, allocationsRes] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("organization_id", orgId)
          .in("user_id", userIds),
        supabase
          .from("user_token_allocations")
          .select("id, user_id, current_balance, monthly_quota")
          .eq("organization_id", orgId)
          .in("user_id", userIds),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (allocationsRes.error) throw allocationsRes.error;

      const roleMap = new Map(rolesRes.data?.map((r) => [r.user_id, r]) || []);
      const allocMap = new Map(allocationsRes.data?.map((a) => [a.user_id, a]) || []);

      const combinedUsers: OrganizationUser[] = (profiles || []).map((p) => {
        const userRole = roleMap.get(p.id);
        const allocation = allocMap.get(p.id);
        return {
          id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          role: userRole?.role || "user",
          current_balance: allocation?.current_balance || 0,
          monthly_quota: allocation?.monthly_quota || 0,
          allocation_id: allocation?.id || null,
        };
      });

      setUsers(combinedUsers);
    } catch (err) {
      console.error("Error fetching organization users:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, [user, page, pageSize, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    totalCount,
    loading,
    error,
    refetch: fetchUsers,
    hasMore: (page + 1) * pageSize < totalCount,
  };
}
