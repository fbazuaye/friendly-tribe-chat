import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type TokenTransactionType = Database["public"]["Enums"]["token_transaction_type"];
type TokenActionType = Database["public"]["Enums"]["token_action_type"];

interface TokenTransaction {
  id: string;
  organization_id: string;
  user_id: string | null;
  transaction_type: TokenTransactionType;
  amount: number;
  balance_before: number | null;
  balance_after: number | null;
  action_type: TokenActionType | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useTokenTransactions(limit = 50) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
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

      // Fetch transactions
      const { data, error: txError } = await supabase
        .from("token_transactions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (txError) throw txError;

      setTransactions((data as TokenTransaction[]) || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return { transactions, loading, error, refetch: fetchTransactions };
}
