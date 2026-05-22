import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, CheckCircle2, XCircle, Send, Clock, Loader2, TrendingUp, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type Totals = {
  submitted: number;
  sent: number;
  delivered: number;
  undelivered: number;
  failed: number;
  pending: number;
  unique_recipients: number;
};
type DailyPoint = { day: string; submitted: number; delivered: number; failed: number };
type ErrorRow = { code: string; sample_message: string; count: number };

const RANGES = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: 3650 },
];

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

export function SMSAnalytics() {
  const { organizationId } = useUserRole();
  const [rangeKey, setRangeKey] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    const range = RANGES.find((r) => r.key === rangeKey)!;
    const to = new Date();
    const from = new Date(to.getTime() - range.days * 86400 * 1000);
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase.rpc as any)("get_sms_org_analytics", {
        _org_id: organizationId,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) {
        console.error("sms analytics error:", error);
      } else if (data) {
        setTotals(data.totals ?? null);
        setDaily(data.daily ?? []);
        setErrors(data.errors ?? []);
      }
      setLoading(false);
    })();
  }, [organizationId, rangeKey]);

  const deliveryRate = useMemo(() => {
    if (!totals || totals.sent === 0) return 0;
    return Math.round((totals.delivered / totals.sent) * 1000) / 10;
  }, [totals]);

  const chartData = useMemo(
    () => daily.map((d) => ({
      day: d.day.slice(5),
      submitted: Number(d.submitted),
      delivered: Number(d.delivered),
      failed: Number(d.failed),
    })),
    [daily]
  );

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            variant={rangeKey === r.key ? "default" : "outline"}
            size="sm"
            onClick={() => setRangeKey(r.key)}
            className="h-8"
          >
            {r.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !totals || totals.submitted === 0 ? (
        <Card className="glass border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No SMS analytics yet for this period.</p>
            <p className="text-xs mt-1">Stats appear once campaigns start delivering.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={<Send className="w-4 h-4" />} label="Submitted" value={totals.submitted} />
            <Kpi icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} label="Delivered" value={totals.delivered} accent="text-emerald-400" />
            <Kpi icon={<XCircle className="w-4 h-4 text-amber-400" />} label="Undelivered" value={totals.undelivered} accent="text-amber-400" />
            <Kpi icon={<XCircle className="w-4 h-4 text-destructive" />} label="Failed" value={totals.failed} accent="text-destructive" />
            <Kpi icon={<TrendingUp className="w-4 h-4 text-primary" />} label="Delivery rate" value={`${deliveryRate}%`} accent="text-primary" />
            <Kpi icon={<Users className="w-4 h-4" />} label="Unique recipients" value={totals.unique_recipients} />
          </div>

          {/* Pending pill */}
          {totals.pending > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>{totals.pending.toLocaleString()} message(s) still awaiting a final carrier receipt.</span>
            </div>
          )}

          {/* Trend chart */}
          <Card className="glass border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily volume & delivery rate</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="submitted" name="Submitted" fill="hsl(var(--primary) / 0.35)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delivered" name="Delivered" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Line dataKey="failed" name="Failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top failures */}
          <Card className="glass border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top failure reasons</CardTitle>
            </CardHeader>
            <CardContent>
              {errors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No delivery failures recorded — great job!
                </p>
              ) : (
                <div className="space-y-2">
                  {errors.map((e) => (
                    <div
                      key={e.code}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{friendlyError(e.code)}</p>
                        {e.sample_message && (
                          <p className="text-xs text-muted-foreground truncate">{e.sample_message}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 tabular-nums">
                        {Number(e.count).toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground px-1">
            Note: SMS does not support read receipts. "Delivered" reflects the carrier's confirmation that the message reached the handset.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <Card className="glass border-border/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <p className={`text-xl font-bold tabular-nums ${accent ?? ""}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  );
}
