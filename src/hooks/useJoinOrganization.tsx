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
      // 1. Look up organization by invite code
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("invite_code", trimmedCode)
        .maybeSingle();

      if (orgError) {
        console.error("Error looking up organization:", orgError);
        setError("Failed to verify invite code. Please try again.");
        return false;
      }

      if (!org) {
        setError("Invalid invite code. Please check and try again.");
        return false;
      }

      // 2. Update profile with organization_id
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ organization_id: org.id })
        .eq("id", user.id);

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

      // Note: Token allocation is handled by admins, not during self-registration

      toast({
        title: "Welcome!",
        description: `You've joined ${org.name}`,
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
