import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface OrganizationWallet {
  id: string;
  organization_id: string;
  total_tokens: number;
  tokens_purchased: number;
  tokens_allocated: number;
  tokens_consumed: number;
  last_purchase_at: string | null;
  tokens_expire_at: string | null;
}

interface Organization {
  id: string;
  name: string;
}

export function useOrganizationWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<OrganizationWallet | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchWallet = async () => {
      try {
        // First get the user's organization
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.organization_id) {
          setLoading(false);
          return;
        }

        // Fetch organization details
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name")
          .eq("id", profile.organization_id)
          .maybeSingle();

        if (org) {
          setOrganization(org);
        }

        // Fetch organization wallet
        const { data: walletData, error: walletError } = await supabase
          .from("organization_wallets")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .maybeSingle();

        if (walletError) throw walletError;
        setWallet(walletData);
      } catch (err) {
        console.error("Error fetching organization wallet:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch wallet");
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, [user]);

  const availableTokens = wallet 
    ? wallet.total_tokens - wallet.tokens_allocated 
    : 0;

  return { 
    wallet, 
    organization, 
    availableTokens, 
    loading, 
    error,
    refetch: () => {
      setLoading(true);
      // Trigger re-fetch by updating user dependency
    }
  };
}
