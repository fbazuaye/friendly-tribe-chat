import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface TokenAllocation {
  monthly_quota: number;
  current_balance: number;
  organization_id: string;
  last_reset_at: string;
}

interface UseTokenBalanceReturn {
  balance: number;
  monthlyQuota: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTokenBalance(): UseTokenBalanceReturn {
  const { user } = useAuth();
  const [allocation, setAllocation] = useState<TokenAllocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalance = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("user_token_allocations")
        .select("monthly_quota, current_balance, organization_id, last_reset_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setAllocation(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [user]);

  return {
    balance: allocation?.current_balance ?? 0,
    monthlyQuota: allocation?.monthly_quota ?? 0,
    loading,
    error,
    refetch: fetchBalance,
  };
}
