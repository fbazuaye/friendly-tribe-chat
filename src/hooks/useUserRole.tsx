import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type AppRole = "super_admin" | "admin" | "moderator" | "user";

interface UseUserRoleReturn {
  role: AppRole | null;
  organizationId: string | null;
  loading: boolean;
  error: Error | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isModerator: boolean;
  refetch: () => Promise<void>;
}

export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRole = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // First get the user's organization from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id);

        // Then get their role in that organization
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();

        if (roleError) throw roleError;
        setRole(roleData?.role as AppRole ?? null);
      }

      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRole();
  }, [user]);

  return {
    role,
    organizationId,
    loading,
    error,
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
    isModerator: role === "moderator" || role === "admin" || role === "super_admin",
    refetch: fetchRole,
  };
}
