import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Check, Bell, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Stats {
  total_recipients: number | null;
  push_sent_count: number;
  push_failed_count: number;
  read_count: number;
  delivery_completed_at: string | null;
}

interface Props {
  messageId: string;
  channelId: string;
  deliveryCompletedAt?: string | null;
}

export function BroadcastReceipts({ messageId, channelId, deliveryCompletedAt }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
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
        });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, deliveryCompletedAt]);

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
        () => load()
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
        <div className="mt-4 space-y-3">
          <Row label="Recipients" value={recipients.toLocaleString()} />
          <Row
            label="Push notifications sent"
            value={stats.push_sent_count.toLocaleString()}
            sub={
              recipients > 0
                ? `${Math.round((stats.push_sent_count / recipients) * 100)}% of audience`
                : undefined
            }
          />
          <Row
            label="Push failed / no device"
            value={stats.push_failed_count.toLocaleString()}
            sub="Subscribers without active push subscriptions"
          />
          <Row
            label="Reads"
            value={stats.read_count.toLocaleString()}
            sub={
              recipients > 0
                ? `${Math.round((stats.read_count / recipients) * 100)}% read rate`
                : undefined
            }
          />
          <Row
            label="Status"
            value={
              stats.delivery_completed_at
                ? `Delivered ${format(new Date(stats.delivery_completed_at), "PPp")}`
                : "Delivery in progress…"
            }
          />
        </div>
      </SheetContent>
    </Sheet>
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
