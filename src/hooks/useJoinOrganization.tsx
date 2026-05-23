import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function useJoinOrganization() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinOrganization = async (inviteCode: string) => {
    if (!user) {
      setError("You must be signed in to join an organization");
      return false;
    }

    const trimmedCode = inviteCode.trim().toUpperCase();
    if (!trimmedCode) {
      setError("Please enter an invite code");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Look up organization by invite code via security-definer RPC
      const { data: orgs, error: orgError } = await supabase
        .rpc("find_organization_by_invite_code", { _code: trimmedCode });

      if (orgError) {
        console.error("Error looking up organization:", orgError);
        setError("Failed to verify invite code. Please try again.");
        return false;
      }

      const org = Array.isArray(orgs) ? orgs[0] : orgs;

      if (!org) {
        setError("Invalid invite code. Please check and try again.");
        return false;
      }

      // 2. Ensure profile exists and set organization_id
      // (Some accounts can end up without a profile row; UPDATE would silently affect 0 rows.)
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            organization_id: org.id,
          },
          { onConflict: "id" }
        );

      if (profileError) {
        console.error("Error updating profile:", profileError);
        setError("Failed to join organization. Please try again.");
        return false;
      }

      // 3. Create user_role entry (default: 'user')
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: user.id,
          organization_id: org.id,
          role: "user",
        });

      if (roleError) {
        // Role might already exist, log but don't fail
        console.error("Error creating user role:", roleError);
      }

      // 4. Grant welcome tokens (non-blocking — falls back to 0 if wallet is empty)
      let grantedTokens = 0;
      try {
        const { data: granted, error: grantError } = await supabase.rpc(
          "grant_welcome_tokens",
          { _user_id: user.id, _org_id: org.id, _amount: 500 }
        );
        if (grantError) {
          console.error("Welcome token grant failed:", grantError);
        } else {
          grantedTokens = Number(granted) || 0;
        }
      } catch (e) {
        console.error("Unexpected welcome token grant error:", e);
      }

      toast({
        title: "Welcome!",
        description:
          grantedTokens > 0
            ? `You've joined ${org.name} with ${grantedTokens} tokens to get started.`
            : `You've joined ${org.name}`,
      });

      // 5. Redirect to chats
      navigate("/chats");
      return true;
    } catch (err) {
      console.error("Unexpected error joining organization:", err);
      setError("An unexpected error occurred. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return {
    joinOrganization,
    isLoading,
    error,
    clearError,
  };
}
