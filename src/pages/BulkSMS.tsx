import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MessageSquare, Users, History, Loader2, ShieldAlert } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { SMSContactManager } from "@/components/sms/SMSContactManager";
import { SMSComposer } from "@/components/sms/SMSComposer";
import { SMSHistory } from "@/components/sms/SMSHistory";
import { useEffect } from "react";

export default function BulkSMS() {
  const navigate = useNavigate();
  const { loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState("compose");

  const loading = authLoading || roleLoading;
  const isAdmin = role === "super_admin" || role === "admin";

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/");
    }
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <ShieldAlert className="w-16 h-16 text-destructive" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">Admin access required for Bulk SMS.</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <header className="glass-strong border-b border-border/50 sticky top-0 z-40">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gradient">Bulk SMS</h1>
            <p className="text-xs text-muted-foreground">Send SMS to multiple recipients</p>
          </div>
        </div>
      </header>

      <div className="p-4 pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
            <TabsTrigger value="compose" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Compose</span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Contacts</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="mt-6">
            <SMSComposer />
          </TabsContent>
          <TabsContent value="contacts" className="mt-6">
            <SMSContactManager />
          </TabsContent>
          <TabsContent value="history" className="mt-6">
            <SMSHistory />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
