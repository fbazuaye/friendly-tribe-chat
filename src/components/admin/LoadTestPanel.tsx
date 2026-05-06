import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, Trash2, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ChannelOpt {
  id: string;
  name: string;
  subscriber_count: number;
}

interface ProgressRow {
  total_jobs: number;
  pending: number;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  recipients_sent: number;
  recipients_failed: number;
}

interface MessageRow {
  id: string;
  total_recipients: number;
  push_sent_count: number;
  push_failed_count: number;
  delivery_completed_at: string | null;
  created_at: string;
}

export function LoadTestPanel() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChannelOpt[]>([]);
  const [channelId, setChannelId] = useState<string>("");
  const [count, setCount] = useState<number>(100_000);
  const [content, setContent] = useState<string>("Throughput test");
  const [running, setRunning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageRow | null>(null);
  const [progress, setProgress] = useState<ProgressRow | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);

  // Load channels owned by the current user
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("broadcast_channels")
        .select("id, name, subscriber_count")
        .eq("owner_id", user.id)
        .order("name");
      setChannels((data as ChannelOpt[]) || []);
      if (data && data.length && !channelId) setChannelId(data[0].id);
    })();
  }, [user?.id]);

  // Polling loop while a test is in flight
  useEffect(() => {
    if (!messageId) return;
    let cancelled = false;

    const tick = async () => {
      const [{ data: msgData }, { data: progData }] = await Promise.all([
        supabase
          .from("broadcast_messages")
          .select("id, total_recipients, push_sent_count, push_failed_count, delivery_completed_at, created_at")
          .eq("id", messageId)
          .maybeSingle(),
        supabase.rpc("get_delivery_progress", { _parent_id: messageId }),
      ]);
      if (cancelled) return;
      if (msgData) setMessage(msgData as MessageRow);
      const row = Array.isArray(progData) ? progData[0] : progData;
      if (row) setProgress(row as ProgressRow);
      if ((msgData as MessageRow | null)?.delivery_completed_at && !endedAt) {
        setEndedAt(Date.now());
      }
    };

    tick();
    pollRef.current = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [messageId, endedAt]);

  const selected = channels.find((c) => c.id === channelId);

  const elapsedMs = useMemo(() => {
    if (!startedAt) return 0;
    return (endedAt ?? Date.now()) - startedAt;
  }, [startedAt, endedAt, progress]);

  const total = message?.total_recipients ?? 0;
  const accounted = (progress?.recipients_sent ?? 0) + (progress?.recipients_failed ?? 0);
  const pct = total > 0 ? Math.min(100, (accounted / total) * 100) : 0;
  const jobsTotal = progress?.total_jobs ?? 0;
  const jobsDone = (progress?.succeeded ?? 0) + (progress?.failed ?? 0) + (progress?.dead ?? 0);
  const jobsPct = jobsTotal > 0 ? Math.min(100, (jobsDone / jobsTotal) * 100) : 0;
  const ratePerSec = elapsedMs > 0 ? Math.round((accounted / elapsedMs) * 1000) : 0;

  const handleRun = async () => {
    if (!channelId || running) return;
    if (count > 100_000) {
      if (!confirm(`Generate ${count.toLocaleString()} fake subscribers and fire a real broadcast? This will write to the database and may take several minutes.`)) return;
    }
    setRunning(true);
    setMessage(null);
    setProgress(null);
    setMessageId(null);
    setEndedAt(null);
    setStartedAt(Date.now());
    try {
      const { data, error } = await supabase.functions.invoke("load-test-broadcast", {
        body: { channel_id: channelId, count, send_broadcast: true, content },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const mid = (data as any)?.broadcast?.message_id as string | undefined;
      if (!mid) throw new Error("No message_id returned");
      setMessageId(mid);
      toast({
        title: "Load test started",
        description: `Inserted ${(data as any).inserted_fake_subscribers?.toLocaleString?.() ?? "?"} subs in ${(data as any).subscribe_ms}ms. Watching delivery…`,
      });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Load test failed", description: err.message || String(err), variant: "destructive" });
      setStartedAt(null);
    } finally {
      setRunning(false);
    }
  };

  const handleCleanup = async () => {
    if (!channelId || cleaning) return;
    if (!confirm("Delete all fake subscribers from this channel? Real org members are kept.")) return;
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke("load-test-broadcast", {
        body: { channel_id: channelId, count: 0, cleanup: true },
      });
      if (error) throw error;
      toast({
        title: "Cleanup complete",
        description: `Removed ${(data as any)?.cleaned_up?.toLocaleString?.() ?? 0} fake subscribers.`,
      });
      // Refresh channel counts
      const { data: chs } = await supabase
        .from("broadcast_channels")
        .select("id, name, subscriber_count")
        .eq("owner_id", user!.id)
        .order("name");
      setChannels((chs as ChannelOpt[]) || []);
    } catch (err: any) {
      toast({ title: "Cleanup failed", description: err.message || String(err), variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Broadcast Load Test</h3>
          <p className="text-sm text-muted-foreground">
            Generate fake subscribers and fire a real broadcast through the queue. Fake subscribers count as no-device failures — that's expected. The point is to measure enqueue + worker throughput end-to-end.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Channel (must be owned by you)</Label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            disabled={running}
            className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {channels.length === 0 && <option value="">No channels you own</option>}
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.subscriber_count.toLocaleString()} subs
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Fake subscribers to add</Label>
          <Input
            type="number"
            min={0}
            max={1_000_000}
            step={10_000}
            value={count}
            onChange={(e) => setCount(Math.max(0, Math.min(1_000_000, Number(e.target.value) || 0)))}
            disabled={running}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Broadcast content</Label>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={running}
            placeholder="Throughput test"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleRun} disabled={running || !channelId} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Starting…" : "Run load test"}
        </Button>
        <Button onClick={handleCleanup} disabled={cleaning || !channelId} variant="outline" className="gap-2">
          {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Clean up fake subs
        </Button>
        {messageId && (
          <Button
            onClick={() => {
              setMessageId(null);
              setMessage(null);
              setProgress(null);
              setStartedAt(null);
              setEndedAt(null);
            }}
            variant="ghost"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
        )}
      </div>

      {messageId && (
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Recipients delivered{" "}
              <span className="tabular-nums text-muted-foreground">
                {accounted.toLocaleString()} / {total.toLocaleString()}
              </span>
            </div>
            <Badge variant={endedAt ? "default" : "secondary"} className="tabular-nums">
              {endedAt ? "Complete" : "In progress"} · {(elapsedMs / 1000).toFixed(1)}s
            </Badge>
          </div>
          <Progress value={pct} className="h-2" />

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Worker batches{" "}
              <span className="tabular-nums text-muted-foreground">
                {jobsDone.toLocaleString()} / {jobsTotal.toLocaleString()}
              </span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {ratePerSec.toLocaleString()} recipients/s
            </span>
          </div>
          <Progress value={jobsPct} className="h-2" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="Sent" value={progress?.recipients_sent ?? 0} tone="emerald" />
            <Stat label="Failed (no device)" value={progress?.recipients_failed ?? 0} tone="amber" />
            <Stat label="Pending jobs" value={(progress?.pending ?? 0) + (progress?.claimed ?? 0)} tone="blue" />
            <Stat label="Dead jobs" value={progress?.dead ?? 0} tone="red" />
          </div>

          <p className="text-xs text-muted-foreground">
            Message id: <code className="font-mono">{messageId}</code>
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "blue" | "red" }) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
      ? "text-amber-500"
      : tone === "blue"
      ? "text-primary"
      : "text-destructive";
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${toneClass}`}>{value.toLocaleString()}</div>
    </div>
  );
}
