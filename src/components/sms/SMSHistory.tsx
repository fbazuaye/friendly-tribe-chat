import { useState, useEffect, useMemo } from "react";
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

type Progress = {
  total_jobs: number;
  pending: number;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  recipients_sent: number;
  recipients_failed: number;
};

export function SMSHistory() {
  const { organizationId } = useUserRole();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressById, setProgressById] = useState<Record<string, Progress>>({});

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
    const i = setInterval(fetchLogs, 10000);
    return () => clearInterval(i);
  }, [organizationId]);

  const inFlightIds = useMemo(
    () => logs.filter((l) => l.status === "queued" || l.status === "sending").map((l) => l.id),
    [logs]
  );

  useEffect(() => {
    if (inFlightIds.length === 0) return;
    let cancelled = false;
    const loadAll = async () => {
      const updates: Record<string, Progress> = {};
      await Promise.all(
        inFlightIds.map(async (id) => {
          const { data, error } = await (supabase.rpc as any)("get_delivery_progress", {
            _parent_id: id,
          });
          if (!error && data) {
            const row: any = Array.isArray(data) ? data[0] : data;
            if (row) {
              updates[id] = {
                total_jobs: Number(row.total_jobs ?? 0),
                pending: Number(row.pending ?? 0),
                claimed: Number(row.claimed ?? 0),
                succeeded: Number(row.succeeded ?? 0),
                failed: Number(row.failed ?? 0),
                dead: Number(row.dead ?? 0),
                recipients_sent: Number(row.recipients_sent ?? 0),
                recipients_failed: Number(row.recipients_failed ?? 0),
              };
            }
          }
        })
      );
      if (!cancelled) setProgressById((prev) => ({ ...prev, ...updates }));
    };
    loadAll();
    const i = setInterval(loadAll, 5000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [inFlightIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor = (status: string) => {
    switch (status) {
      case "sent": return "default";
      case "failed": return "destructive";
      case "sending":
      case "queued": return "secondary";
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
            {logs.map((log) => {
              const prog = progressById[log.id];
              const inFlight = log.status === "queued" || log.status === "sending";
              const sent = prog ? prog.recipients_sent : 0;
              const failed = prog ? prog.recipients_failed : 0;
              const accounted = sent + failed;
              const total = log.recipient_count || 1;
              const pct = Math.min(100, (accounted / total) * 100);
              return (
                <div key={log.id} className="p-3 rounded-lg bg-secondary/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "MMM d, yyyy · h:mm a")}
                    </span>
                    <Badge variant={statusColor(log.status) as any}>
                      {inFlight && prog
                        ? `${log.status} · ${prog.pending + prog.claimed} batches left`
                        : log.status}
                    </Badge>
                  </div>
                  <p className="text-sm line-clamp-2">{log.message}</p>
                  {inFlight && prog ? (
                    <div className="space-y-1 pt-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all animate-pulse"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {accounted.toLocaleString()}/{log.recipient_count.toLocaleString()} sent
                        {failed > 0 ? ` · ${failed.toLocaleString()} failed` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {log.recipient_count.toLocaleString()} recipient{log.recipient_count === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
