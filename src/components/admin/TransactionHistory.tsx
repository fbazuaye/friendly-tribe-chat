import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowUpRight, ArrowDownRight, RefreshCw, Clock } from "lucide-react";
import { useTokenTransactions } from "@/hooks/useTokenTransactions";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type TokenTransactionType = Database["public"]["Enums"]["token_transaction_type"];

const transactionConfig: Record<
  TokenTransactionType,
  { label: string; icon: typeof ArrowUpRight; color: string }
> = {
  purchase: { label: "Purchase", icon: ArrowDownRight, color: "text-success" },
  allocation: { label: "Allocation", icon: ArrowUpRight, color: "text-accent" },
  revocation: { label: "Revocation", icon: ArrowDownRight, color: "text-destructive" },
  consumption: { label: "Consumption", icon: ArrowUpRight, color: "text-warning" },
  expiration: { label: "Expired", icon: Clock, color: "text-muted-foreground" },
  monthly_reset: { label: "Monthly Reset", icon: RefreshCw, color: "text-primary" },
};

export function TransactionHistory() {
  const { transactions, loading } = useTokenTransactions(50);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Transaction History</h2>
        <p className="text-sm text-muted-foreground">
          Recent token activities in your organization
        </p>
      </div>

      <div className="space-y-2">
        {transactions.map((tx) => {
          const config = transactionConfig[tx.transaction_type];
          const Icon = config.icon;
          const isPositive = ["purchase", "monthly_reset"].includes(tx.transaction_type);

          return (
            <Card key={tx.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full bg-secondary flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{config.label}</span>
                      {tx.action_type && (
                        <Badge variant="secondary" className="text-xs">
                          {tx.action_type.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className={`font-semibold ${isPositive ? "text-success" : "text-foreground"}`}>
                      {isPositive ? "+" : "-"}{Math.abs(tx.amount).toLocaleString()}
                    </p>
                    {tx.balance_after !== null && (
                      <p className="text-xs text-muted-foreground">
                        Balance: {tx.balance_after.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {transactions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No transactions yet
          </div>
        )}
      </div>
    </div>
  );
}
