import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Loader2, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PurchaseTokensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const tokenPackages = [
  { amount: 1000, price: 10, popular: false },
  { amount: 5000, price: 45, popular: true },
  { amount: 10000, price: 80, popular: false },
  { amount: 50000, price: 350, popular: false },
];

export function PurchaseTokensDialog({ open, onOpenChange, onSuccess }: PurchaseTokensDialogProps) {
  const { toast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(5000);
  const [customAmount, setCustomAmount] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handlePurchase = async () => {
    const amount = selectedPackage || parseInt(customAmount, 10);
    if (!amount || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please select or enter a valid token amount",
        variant: "destructive",
      });
      return;
    }

    setIsPurchasing(true);
    
    // Simulated purchase - in production, this would integrate with Stripe
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      toast({
        title: "Purchase simulated",
        description: `This is a demo. In production, ${amount} tokens would be purchased via Stripe.`,
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Purchase failed",
        description: "Failed to process purchase",
        variant: "destructive",
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Purchase Tokens
          </DialogTitle>
          <DialogDescription>
            Add tokens to your organization wallet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Token packages */}
          <div className="grid grid-cols-2 gap-3">
            {tokenPackages.map((pkg) => (
              <button
                key={pkg.amount}
                onClick={() => {
                  setSelectedPackage(pkg.amount);
                  setCustomAmount("");
                }}
                className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                  selectedPackage === pkg.amount
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {pkg.popular && (
                  <span className="absolute -top-2 right-2 px-2 py-0.5 bg-accent text-accent-foreground text-xs rounded-full font-medium">
                    Popular
                  </span>
                )}
                <p className="text-2xl font-bold">{pkg.amount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">tokens</p>
                <p className="text-lg font-semibold text-primary mt-2">
                  ${pkg.price}
                </p>
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="space-y-2">
            <Label>Or enter custom amount</Label>
            <Input
              type="number"
              placeholder="Enter token amount"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedPackage(null);
              }}
              min={100}
            />
            {customAmount && (
              <p className="text-sm text-muted-foreground">
                Estimated cost: ${(parseInt(customAmount, 10) * 0.009).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={isPurchasing || (!selectedPackage && !customAmount)}
            className="gap-2 bg-gradient-primary hover:opacity-90"
          >
            {isPurchasing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            Purchase Tokens
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
