import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  KeyRound, 
  RefreshCw, 
  Copy, 
  Check, 
  Loader2,
  Users
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function InviteCodeManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchOrganizationData();
  }, [user]);

  const fetchOrganizationData = async () => {
    if (!user) return;

    try {
      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.organization_id) {
        setLoading(false);
        return;
      }

      setOrganizationId(profile.organization_id);

      // Get organization details including invite code
      const { data: org } = await supabase
        .from("organizations")
        .select("name, invite_code")
        .eq("id", profile.organization_id)
        .maybeSingle();

      if (org) {
        setOrganizationName(org.name);
        setInviteCode(org.invite_code);
      }
    } catch (error) {
      console.error("Error fetching organization data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!organizationId) return;

    setRegenerating(true);
    const newCode = generateInviteCode();

    try {
      const { error } = await supabase
        .from("organizations")
        .update({ invite_code: newCode })
        .eq("id", organizationId);

      if (error) {
        throw error;
      }

      setInviteCode(newCode);
      toast({
        title: "Invite code regenerated",
        description: "The new code is now active. Previous code will no longer work.",
      });
    } catch (error) {
      console.error("Error regenerating invite code:", error);
      toast({
        title: "Failed to regenerate code",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the code manually.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Organization Invite Code</CardTitle>
            <CardDescription>
              Share this code with new team members to join {organizationName || "your organization"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite Code Display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Input
              value={inviteCode || "No code set"}
              readOnly
              className="font-mono text-lg tracking-widest uppercase bg-secondary/50 pr-12"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={handleCopyCode}
              disabled={!inviteCode}
            >
              {copied ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Info text */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">
          <Users className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            New users can enter this code after signing up to automatically join your organization 
            with the default "user" role and 100 monthly tokens.
          </p>
        </div>

        {/* Regenerate Button */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full gap-2"
              disabled={regenerating}
            >
              {regenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate Invite Code
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate Invite Code?</AlertDialogTitle>
              <AlertDialogDescription>
                This will create a new invite code. The current code will stop working immediately. 
                Anyone who hasn't joined yet will need the new code.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRegenerateCode}>
                Regenerate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
