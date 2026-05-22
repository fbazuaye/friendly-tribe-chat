import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, CheckCircle2, XCircle, Send, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

type Totals = {
  submitted: number; sent: number; delivered: number;
  undelivered: number; failed: number; pending: number;
};
type ErrorRow = { code: string; sample_message: string; count: number };

const friendlyError = (code: string) => {
  const map: Record<string, string> = {
    "30003": "Unreachable handset",
    "30004": "Message blocked",
    "30005": "Unknown destination",
    "30006": "Landline / unreachable carrier",
    "30007": "Carrier filtered (spam)",
    "30008": "Unknown delivery error",
    "21211": "Invalid 'To' number",
    "21610": "Recipient unsubscribed",
    "21614": "Number is not a mobile",
    "unknown": "Unspecified error",
  };
  return map[code] || `Carrier error ${code}`;
};

interface Props {
  smsLogId: string | null;
  message: string;
  onClose: () => void;
}

export function SMSCampaignDetail({ smsLogId, message, onClose }: Props) {
  const { organizationId } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!smsLogId) return;
    setLoading(true);
    (async () => {
      const [{ data: stats }, { data: recs }] = await Promise.all([
        (supabase.rpc as any)("get_sms_campaign_analytics", { _sms_log_id: smsLogId }),
        supabase
          .from("sms_recipients")
          .select("phone_number, status, error_code, error_message, submitted_at, delivered_at")
          .eq("sms_log_id", smsLogId)
          .order("submitted_at", { ascending: false })
          .limit(500),
      ]);
      if (stats) {
        setTotals(stats.totals ?? null);
        setErrors(stats.errors ?? []);
      }
      setRecipients(recs ?? []);
      setLoading(false);
    })();
  }, [smsLogId, reloadKey]);

  const runBackfill = async () => {
    if (!smsLogId || !organizationId || backfilling) return;
    setBackfilling(true);
    const t = toast.loading("Refreshing delivery status…");
    try {
      const { data, error } = await supabase.functions.invoke("sms-backfill-status", {
        body: { org_id: organizationId, sms_log_id: smsLogId },
      });
      if (error) throw error;
      const r = data as any;
      toast.success(
        `Recovered ${r?.recipientsInserted ?? 0} recipients · refreshed ${r?.statusUpdates ?? 0} statuses${r?.twilioPollingEnabled === false ? " (Twilio polling disabled)" : ""}.`,
        { id: t }
      );
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(`Backfill failed: ${e?.message ?? String(e)}`, { id: t });
    } finally {
      setBackfilling(false);
    }
  };

  const exportCsv = () => {
    if (recipients.length === 0) return;
    const rows = [
      ["phone_number", "status", "error_code", "error_message", "submitted_at", "delivered_at"],
      ...recipients.map((r) => [
        r.phone_number, r.status, r.error_code ?? "",
        (r.error_message ?? "").replaceAll('"', "'"),
        r.submitted_at ?? "", r.delivered_at ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? "")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sms-campaign-${smsLogId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deliveryRate = totals && totals.sent > 0
    ? Math.round((totals.delivered / totals.sent) * 1000) / 10
    : 0;

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: any; label: string }> = {
      delivered: { variant: "default", label: "Delivered" },
      sent: { variant: "secondary", label: "Sent" },
      queued: { variant: "outline", label: "Queued" },
      undelivered: { variant: "destructive", label: "Undelivered" },
      failed: { variant: "destructive", label: "Failed" },
    };
    const m = map[status] || { variant: "outline", label: status };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <Sheet open={!!smsLogId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle>Campaign analytics</SheetTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={runBackfill}
            disabled={backfilling}
            className="h-8 mr-6"
            title="Recover per-recipient delivery status from the carrier."
          >
            {backfilling ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Refresh status
          </Button>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Card className="glass border-border/50">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <p className="text-sm">{message}</p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : totals ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<Send className="w-3.5 h-3.5" />} label="Submitted" value={totals.submitted} />
                <Stat icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />} label="Delivered" value={totals.delivered} />
                <Stat icon={<TrendingUp className="w-3.5 h-3.5 text-primary" />} label="Rate" value={`${deliveryRate}%`} />
                <Stat icon={<XCircle className="w-3.5 h-3.5 text-amber-400" />} label="Undelivered" value={totals.undelivered} />
                <Stat icon={<XCircle className="w-3.5 h-3.5 text-destructive" />} label="Failed" value={totals.failed} />
                <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Pending" value={totals.pending} />
              </div>

              {errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Failure reasons</p>
                  {errors.map((e) => (
                    <div key={e.code} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30">
                      <span className="text-sm truncate">{friendlyError(e.code)}</span>
                      <Badge variant="outline" className="tabular-nums">{Number(e.count).toLocaleString()}</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Recipients ({recipients.length}{recipients.length === 500 ? "+" : ""})</p>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={recipients.length === 0}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                </Button>
              </div>

              <div className="rounded-lg border border-border/50 overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/40 sticky top-0">
                      <tr className="text-left">
                        <th className="px-2 py-2 font-medium">Phone</th>
                        <th className="px-2 py-2 font-medium">Status</th>
                        <th className="px-2 py-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="px-2 py-1.5 tabular-nums">{r.phone_number}</td>
                          <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
                          <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[14rem]">
                            {r.error_code ? friendlyError(String(r.error_code)) : ""}
                          </td>
                        </tr>
                      ))}
                      {recipients.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-2 py-6 text-center text-muted-foreground">
                            No per-recipient telemetry available for this campaign.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No analytics for this campaign.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="glass border-border/50">
      <CardContent className="p-2.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
          {icon}<span>{label}</span>
        </div>
        <p className="text-lg font-bold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  );
}
