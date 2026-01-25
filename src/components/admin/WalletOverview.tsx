import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, TrendingUp, Users, ArrowUpRight, Loader2 } from "lucide-react";
import { useOrganizationWallet } from "@/hooks/useOrganizationWallet";

interface WalletOverviewProps {
  onPurchase: () => void;
}

export function WalletOverview({ onPurchase }: WalletOverviewProps) {
  const { wallet, organization, availableTokens, loading } = useOrganizationWallet();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = [
    {
      label: "Total Tokens",
      value: wallet?.total_tokens?.toLocaleString() || "0",
      icon: Coins,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Available to Allocate",
      value: availableTokens.toLocaleString(),
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Allocated to Users",
      value: wallet?.tokens_allocated?.toLocaleString() || "0",
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      label: "Consumed",
      value: wallet?.tokens_consumed?.toLocaleString() || "0",
      icon: ArrowUpRight,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Organization header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{organization?.name || "Organization"}</h2>
          <p className="text-muted-foreground">Token Wallet Overview</p>
        </div>
        <Button onClick={onPurchase} className="gap-2 bg-gradient-primary hover:opacity-90">
          <Coins className="w-4 h-4" />
          Purchase Tokens
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage bar */}
      {wallet && wallet.total_tokens > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Token Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-4 bg-secondary rounded-full overflow-hidden flex">
                <div 
                  className="bg-success transition-all duration-300"
                  style={{ width: `${(availableTokens / wallet.total_tokens) * 100}%` }}
                />
                <div 
                  className="bg-accent transition-all duration-300"
                  style={{ width: `${((wallet.tokens_allocated - wallet.tokens_consumed) / wallet.total_tokens) * 100}%` }}
                />
                <div 
                  className="bg-warning transition-all duration-300"
                  style={{ width: `${(wallet.tokens_consumed / wallet.total_tokens) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Available
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                  Active Allocations
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  Consumed
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
