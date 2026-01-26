import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOrganizationCheck() {
  const { user, loading: authLoading } = useAuth();
  const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkOrganization = useCallback(async () => {
    if (!user) {
      setHasOrganization(null);
      setOrganizationId(null);
      setLoading(false);
      return;
    }

    // Reset state before checking
    setLoading(true);
    setHasOrganization(null);

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking organization:", error);
        setHasOrganization(false);
        setOrganizationId(null);
      } else if (profile?.organization_id) {
        setHasOrganization(true);
        setOrganizationId(profile.organization_id);
      } else {
        setHasOrganization(false);
        setOrganizationId(null);
      }
    } catch (err) {
      console.error("Unexpected error checking organization:", err);
      setHasOrganization(false);
      setOrganizationId(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      checkOrganization();
    }
  }, [user?.id, authLoading, checkOrganization]);

  return {
    hasOrganization,
    organizationId,
    loading: authLoading || loading,
    user,
    refetch: checkOrganization,
  };
}
