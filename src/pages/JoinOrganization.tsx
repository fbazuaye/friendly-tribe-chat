import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useJoinOrganization } from "@/hooks/useJoinOrganization";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowRight, 
  Loader2,
  Users,
  KeyRound,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function JoinOrganization() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { joinOrganization, isLoading, error, clearError } = useJoinOrganization();
  const [inviteCode, setInviteCode] = useState("");
  const [checkingOrg, setCheckingOrg] = useState(true);

  // Check if user already has an organization
  useEffect(() => {
    const checkOrganization = async () => {
      if (!user) {
        setCheckingOrg(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.organization_id) {
          // User already has an organization, redirect to chats
          navigate("/chats");
        }
      } catch (err) {
        console.error("Error checking organization:", err);
      } finally {
        setCheckingOrg(false);
      }
    };

    if (!authLoading) {
      checkOrganization();
    }
  }, [user, authLoading, navigate]);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await joinOrganization(inviteCode);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || checkingOrg) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between p-4 pt-safe-top">
          <Logo size="sm" />
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </header>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-md mx-auto w-full">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-primary" />
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">Join Your Team</h1>
          <p className="text-muted-foreground text-center mb-8">
            Enter the invite code shared by your organization admin to get started.
          </p>

          <form onSubmit={handleSubmit} className="w-full space-y-6">
            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite Code</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-code"
                  type="text"
                  placeholder="Enter your invite code"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value.toUpperCase());
                    clearError();
                  }}
                  className={cn(
                    "pl-10 uppercase tracking-wider font-mono",
                    error && "border-destructive"
                  )}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-primary hover:opacity-90"
              disabled={isLoading || !inviteCode.trim()}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Join Organization
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-8">
            Don't have an invite code? Contact your organization administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
