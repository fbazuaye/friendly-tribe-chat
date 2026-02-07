import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";

interface SmsLog {
  id: string;
  message: string;
  recipient_count: number;
  status: string;
  created_at: string;
}

export function SMSHistory() {
  const { organizationId } = useUserRole();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("id, message, recipient_count, status, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) console.error("Error fetching SMS logs:", error);
      setLogs(data || []);
      setLoading(false);
    };
    fetchLogs();
  }, [organizationId]);

  const statusColor = (status: string) => {
    switch (status) {
      case "sent": return "default";
      case "failed": return "destructive";
      case "sending": return "secondary";
      default: return "outline";
    }
  };

  return (
    <Card className="glass border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Send History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No SMS messages sent yet.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="p-3 rounded-lg bg-secondary/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, yyyy · h:mm a")}
                  </span>
                  <Badge variant={statusColor(log.status) as any}>{log.status}</Badge>
                </div>
                <p className="text-sm line-clamp-2">{log.message}</p>
                <p className="text-xs text-muted-foreground">{log.recipient_count} recipient(s)</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
