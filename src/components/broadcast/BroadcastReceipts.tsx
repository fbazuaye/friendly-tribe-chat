import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Check, Bell, Eye, Loader2, FileSpreadsheet, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  exportMessageCsv,
  exportMessagePdf,
  type RecipientRow,
  type MessageStats,
} from "@/lib/broadcastExport";

type Stats = MessageStats & { delivery_legacy?: boolean };

interface Props {
  messageId: string;
  channelId: string;
  deliveryCompletedAt?: string | null;
  channelName?: string;
  messageContent?: string;
  messageCreatedAt?: string;
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

export function BroadcastReceipts({ messageId, channelId, deliveryCompletedAt, channelName, messageContent, messageCreatedAt }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_broadcast_message_stats", {
      _message_id: messageId,
    });
    if (!error && data) {
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row) {
        setStats({
          total_recipients: row.total_recipients,
          push_sent_count: Number(row.push_sent_count ?? 0),
          push_failed_count: Number(row.push_failed_count ?? 0),
          read_count: Number(row.read_count ?? 0),
          delivery_completed_at: row.delivery_completed_at,
          delivery_legacy: !!row.delivery_legacy,
        });
      }
    }
    setLoading(false);
  };

  const loadProgress = async () => {
    const { data, error } = await (supabase.rpc as any)("get_delivery_progress", {
      _parent_id: messageId,
    });
    if (!error && data) {
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row) {
        setProgress({
          total_jobs: Number(row.total_jobs ?? 0),
          pending: Number(row.pending ?? 0),
          claimed: Number(row.claimed ?? 0),
          succeeded: Number(row.succeeded ?? 0),
          failed: Number(row.failed ?? 0),
          dead: Number(row.dead ?? 0),
          recipients_sent: Number(row.recipients_sent ?? 0),
          recipients_failed: Number(row.recipients_failed ?? 0),
        });
      }
    }
  };

  const pendingDelivery = !stats?.delivery_completed_at;

  useEffect(() => {
    load();
    loadProgress();
    const interval = setInterval(() => {
      load();
      if (pendingDelivery) loadProgress();
    }, pendingDelivery ? 3000 : 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, deliveryCompletedAt, pendingDelivery]);

  // Realtime: refresh when this message row updates
  useEffect(() => {
    const ch = supabase
      .channel(`receipts-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcast_messages",
          filter: `id=eq.${messageId}`,
        },
        () => { load(); loadProgress(); }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  if (loading) {
    return (
      <div className="flex items-center gap-1 mt-1 text-[10px] text-primary-foreground/60">
        <Loader2 className="w-3 h-3 animate-spin" />
      </div>
    );
  }

  if (!stats || stats.total_recipients === null) {
    return null;
  }

  const recipients = stats.total_recipients ?? 0;
  const pending = !stats.delivery_completed_at;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          title="Tap for delivery details"
        >
          <span className="inline-flex items-center gap-0.5">
            <Check className="w-3 h-3" />
            {pending ? `Sending… ${recipients}` : `${stats.push_sent_count + stats.push_failed_count}/${recipients}`}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Bell className="w-3 h-3" />
            {stats.push_sent_count}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Eye className="w-3 h-3" />
            {stats.read_count}
          </span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Broadcast delivery</SheetTitle>
        </SheetHeader>
        <DeliveryBreakdown stats={stats} recipients={recipients} pending={pending} />
        <ExportButtons
          messageId={messageId}
          channelName={channelName ?? "Broadcast"}
          messageContent={messageContent ?? ""}
          messageCreatedAt={messageCreatedAt ?? new Date().toISOString()}
          stats={stats}
        />
      </SheetContent>
    </Sheet>
  );
}

function ExportButtons({
  messageId,
  channelName,
  messageContent,
  messageCreatedAt,
  stats,
}: {
  messageId: string;
  channelName: string;
  messageContent: string;
  messageCreatedAt: string;
  stats: Stats;
}) {
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  const fetchRecipients = async (): Promise<RecipientRow[]> => {
    const { data, error } = await supabase.rpc("get_broadcast_message_recipient_breakdown", {
      _message_id: messageId,
    });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      user_id: r.user_id,
      display_name: r.display_name ?? "",
      has_push_device: !!r.has_push_device,
      read_at: r.read_at,
    }));
  };

  const run = async (kind: "csv" | "pdf") => {
    setBusy(kind);
    try {
      const recipients = await fetchRecipients();
      const opts = {
        channelName,
        messageId,
        createdAt: messageCreatedAt,
        content: messageContent,
        stats,
        recipients,
      };
      if (kind === "csv") exportMessageCsv(opts);
      else await exportMessagePdf(opts);
      toast({ title: "Report ready", description: `Downloaded as ${kind.toUpperCase()}` });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not generate report",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Download className="w-3 h-3" /> Export this report
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => run("csv")}
          disabled={busy !== null}
        >
          {busy === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          CSV
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => run("pdf")}
          disabled={busy !== null}
        >
          {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          PDF
        </Button>
      </div>
    </div>
  );
}

function DeliveryBreakdown({
  stats,
  recipients,
  pending,
}: {
  stats: Stats;
  recipients: number;
  pending: boolean;
}) {
  const delivered = stats.push_sent_count;
  const failed = stats.push_failed_count;
  const accountedFor = delivered + failed;
  const remaining = Math.max(0, recipients - accountedFor);
  // While fan-out is in progress, "remaining" = pending; after completion, it = no-device subscribers
  const pendingCount = pending ? remaining : 0;
  const noDeviceCount = pending ? 0 : remaining;

  const pct = (n: number) => (recipients > 0 ? (n / recipients) * 100 : 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Stacked progress bar */}
      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary/60">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${pct(delivered)}%` }}
            title={`Delivered: ${delivered}`}
          />
          <div
            className="bg-destructive transition-all"
            style={{ width: `${pct(failed)}%` }}
            title={`Failed: ${failed}`}
          />
          {pendingCount > 0 && (
            <div
              className="bg-amber-500 transition-all animate-pulse"
              style={{ width: `${pct(pendingCount)}%` }}
              title={`Pending: ${pendingCount}`}
            />
          )}
          {noDeviceCount > 0 && (
            <div
              className="bg-muted-foreground/40 transition-all"
              style={{ width: `${pct(noDeviceCount)}%` }}
              title={`No push device: ${noDeviceCount}`}
            />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          {recipients.toLocaleString()} total recipient{recipients === 1 ? "" : "s"}
        </p>
      </div>

      {/* Categorized rows with colored dots */}
      <div className="space-y-2">
        <BreakdownRow
          dot="bg-emerald-500"
          label="Push delivered"
          sub="Push notification accepted by at least one device"
          count={delivered}
          recipients={recipients}
        />
        <BreakdownRow
          dot="bg-destructive"
          label="Push failed"
          sub="All devices rejected the push"
          count={failed}
          recipients={recipients}
        />
        {pending ? (
          <BreakdownRow
            dot="bg-amber-500"
            label="Pending"
            sub="Fan-out still in progress…"
            count={pendingCount}
            recipients={recipients}
            pulse
          />
        ) : (
          <BreakdownRow
            dot="bg-muted-foreground/40"
            label="No push device"
            sub="Subscriber hasn't enabled notifications"
            count={noDeviceCount}
            recipients={recipients}
          />
        )}
      </div>

      {/* Reads + status */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <Row
          label="Reads"
          value={stats.read_count.toLocaleString()}
          sub={
            recipients > 0
              ? `${Math.round((stats.read_count / recipients) * 100)}% read rate · in-app opens`
              : "in-app opens"
          }
        />
        <Row
          label="Status"
          value={
            stats.delivery_legacy
              ? "Delivered (legacy — push tracking unavailable)"
              : stats.delivery_completed_at
              ? `Delivered ${format(new Date(stats.delivery_completed_at), "PPp")}`
              : "Delivery in progress…"
          }
        />
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
        Push delivered counts recipients whose device accepted the push notification.
        Reads counts recipients who opened the message in-app — a read can happen without a push delivery.
      </p>
    </div>
  );
}

function BreakdownRow({
  dot,
  label,
  sub,
  count,
  recipients,
  pulse,
}: {
  dot: string;
  label: string;
  sub: string;
  count: number;
  recipients: number;
  pulse?: boolean;
}) {
  const pct = recipients > 0 ? Math.round((count / recipients) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-secondary/40">
      <div className="flex items-start gap-2.5 min-w-0">
        <span
          className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot} ${pulse ? "animate-pulse" : ""}`}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">{count.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">{pct}%</p>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-xl bg-secondary/40">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
