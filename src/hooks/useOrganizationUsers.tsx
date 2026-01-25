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

export function useOrganizationUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get the user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.organization_id) {
        setLoading(false);
        return;
      }

      // Fetch all users in the organization
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("organization_id", profile.organization_id);

      if (profilesError) throw profilesError;

      // Fetch roles for these users
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", profile.organization_id);

      if (rolesError) throw rolesError;

      // Fetch token allocations
      const { data: allocations, error: allocationsError } = await supabase
        .from("user_token_allocations")
        .select("id, user_id, current_balance, monthly_quota")
        .eq("organization_id", profile.organization_id);

      if (allocationsError) throw allocationsError;

      // Combine the data
      const combinedUsers: OrganizationUser[] = (profiles || []).map((p) => {
        const userRole = roles?.find((r) => r.user_id === p.id);
        const allocation = allocations?.find((a) => a.user_id === p.id);

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
  }, [user]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, loading, error, refetch: fetchUsers };
}
