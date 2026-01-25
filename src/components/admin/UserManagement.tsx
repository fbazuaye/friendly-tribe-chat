import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Coins, UserCog, ChevronRight } from "lucide-react";
import { useOrganizationUsers } from "@/hooks/useOrganizationUsers";
import { useOrganizationWallet } from "@/hooks/useOrganizationWallet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const roleColors: Record<AppRole, string> = {
  super_admin: "bg-accent text-accent-foreground",
  admin: "bg-primary text-primary-foreground",
  moderator: "bg-warning text-warning-foreground",
  user: "bg-secondary text-secondary-foreground",
};

export function UserManagement() {
  const { users, loading, refetch } = useOrganizationUsers();
  const { availableTokens } = useOrganizationWallet();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<typeof users[0] | null>(null);
  const [allocateAmount, setAllocateAmount] = useState("");
  const [isAllocating, setIsAllocating] = useState(false);

  const filteredUsers = users.filter(
    (user) =>
      user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.includes(searchQuery)
  );

  const handleAllocate = async () => {
    if (!selectedUser || !allocateAmount) return;

    const amount = parseInt(allocateAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }

    if (amount > availableTokens) {
      toast({
        title: "Insufficient tokens",
        description: "You don't have enough tokens in the organization wallet",
        variant: "destructive",
      });
      return;
    }

    setIsAllocating(true);
    try {
      const { error } = await supabase.functions.invoke("allocate-tokens", {
        body: {
          target_user_id: selectedUser.id,
          amount,
          set_as_quota: true,
        },
      });

      if (error) throw error;

      toast({
        title: "Tokens allocated",
        description: `Successfully allocated ${amount} tokens to ${selectedUser.display_name || "user"}`,
      });

      setSelectedUser(null);
      setAllocateAmount("");
      refetch();
    } catch (err) {
      console.error("Error allocating tokens:", err);
      toast({
        title: "Allocation failed",
        description: err instanceof Error ? err.message : "Failed to allocate tokens",
        variant: "destructive",
      });
    } finally {
      setIsAllocating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground">
            {users.length} members in organization
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {filteredUsers.map((user) => (
          <Card
            key={user.id}
            className="border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={() => setSelectedUser(user)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={user.avatar_url || ""} />
                  <AvatarFallback className="bg-gradient-primary text-white">
                    {user.display_name?.slice(0, 2).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {user.display_name || "Unnamed User"}
                    </span>
                    <Badge className={roleColors[user.role]} variant="secondary">
                      {user.role.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      {user.current_balance.toLocaleString()} / {user.monthly_quota.toLocaleString()}
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No users found
          </div>
        )}
      </div>

      {/* Allocation dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Manage User
            </DialogTitle>
            <DialogDescription>
              Allocate tokens to {selectedUser?.display_name || "this user"}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-lg">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={selectedUser.avatar_url || ""} />
                  <AvatarFallback className="bg-gradient-primary text-white">
                    {selectedUser.display_name?.slice(0, 2).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.display_name || "Unnamed User"}</p>
                  <p className="text-sm text-muted-foreground">
                    Current balance: {selectedUser.current_balance.toLocaleString()} tokens
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Monthly Token Allocation</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                  min={0}
                  max={availableTokens + selectedUser.monthly_quota}
                />
                <p className="text-xs text-muted-foreground">
                  Available in organization: {availableTokens.toLocaleString()} tokens
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAllocate}
              disabled={isAllocating || !allocateAmount}
              className="gap-2"
            >
              {isAllocating && <Loader2 className="w-4 h-4 animate-spin" />}
              Allocate Tokens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
