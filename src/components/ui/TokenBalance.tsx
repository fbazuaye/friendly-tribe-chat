import { cn } from "@/lib/utils";
import { Coins, Plus } from "lucide-react";
import { Button } from "./button";

interface TokenBalanceProps {
  balance: number;
  onTopUp?: () => void;
  size?: "sm" | "md" | "lg";
  showTopUp?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: "px-2 py-1 text-xs gap-1",
  md: "px-3 py-1.5 text-sm gap-1.5",
  lg: "px-4 py-2 text-base gap-2",
};

const iconSizes = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function TokenBalance({
  balance,
  onTopUp,
  size = "md",
  showTopUp = false,
  className,
}: TokenBalanceProps) {
  const formattedBalance = balance.toLocaleString();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn(
        "token-pill inline-flex items-center font-medium",
        sizeStyles[size]
      )}>
        <Coins className={iconSizes[size]} />
        <span>{formattedBalance}</span>
      </div>
      
      {showTopUp && onTopUp && (
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "rounded-full",
            size === "sm" && "h-6 w-6",
            size === "md" && "h-8 w-8",
            size === "lg" && "h-10 w-10"
          )}
          onClick={onTopUp}
        >
          <Plus className={iconSizes[size]} />
        </Button>
      )}
    </div>
  );
}
