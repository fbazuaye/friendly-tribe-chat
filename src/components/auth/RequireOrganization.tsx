import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganizationCheck } from "@/hooks/useOrganizationCheck";
import { Loader2 } from "lucide-react";

interface RequireOrganizationProps {
  children: ReactNode;
}

export function RequireOrganization({ children }: RequireOrganizationProps) {
  const navigate = useNavigate();
  const { user, hasOrganization, loading } = useOrganizationCheck();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/auth");
      } else if (hasOrganization === false) {
        navigate("/join-organization");
      }
    }
  }, [user, hasOrganization, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || hasOrganization === false) {
    return null;
  }

  return <>{children}</>;
}
