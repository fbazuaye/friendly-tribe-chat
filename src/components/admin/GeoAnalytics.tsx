import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { Globe, Users, Eye, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Range = "24h" | "7d" | "30d" | "90d";
type Bucket = { label: string; value: number; code?: string };
type Daily = { day: string; visits: number; uniques: number };

interface AnalyticsResult {
  totals: { total_visits: number; unique_visitors: number };
  countries: Bucket[];
  devices: Bucket[];
  browsers: Bucket[];
  oses: Bucket[];
  pages: Bucket[];
  referrers: Bucket[];
  daily: Daily[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(280 80% 60%)",
  "hsl(180 70% 55%)",
  "hsl(330 75% 60%)",
];

function rangeToFrom(range: Range): Date {
  const now = new Date();
  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

function flagEmoji(code?: string) {
  if (!code || code.length !== 2) return "🌐";
  const cc = code.toUpperCase();
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function GeoAnalytics() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;
      setLoading(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      const from = rangeToFrom(range).toISOString();
      const to = new Date().toISOString();
      const { data: result, error } = await supabase.rpc(
        "get_visit_analytics",
        {
          _org_id: profile?.organization_id ?? null,
          _from: from,
          _to: to,
        },
      );
      if (cancelled) return;
      if (error) {
        console.error("geo analytics error", error);
        setData(null);
      } else {
        setData(result as unknown as AnalyticsResult);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, range]);

  const topCountry = useMemo(
    () => data?.countries?.[0]?.label ?? "—",
    [data],
  );
  const avgPerDay = useMemo(() => {
    if (!data?.daily?.length) return 0;
    const sum = data.daily.reduce((a, b) => a + Number(b.visits), 0);
    return Math.round(sum / data.daily.length);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Site Visit Analytics</h2>
        </div>
        <div className="flex gap-1 bg-secondary/40 rounded-lg p-1">
          {(["24h", "7d", "30d", "90d"] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No analytics available yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Eye className="w-4 h-4" />}
              label="Total Visits"
              value={Number(data.totals?.total_visits ?? 0).toLocaleString()}
            />
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Unique Visitors"
              value={Number(
                data.totals?.unique_visitors ?? 0,
              ).toLocaleString()}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Avg / Day"
              value={avgPerDay.toLocaleString()}
            />
            <StatCard
              icon={<Globe className="w-4 h-4" />}
              label="Top Country"
              value={topCountry}
            />
          </div>

          {/* Daily chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="day"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="visits"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="uniques"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Countries */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Countries</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.countries.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="text-center text-muted-foreground"
                        >
                          No data
                        </TableCell>
                      </TableRow>
                    )}
                    {data.countries.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="flex items-center gap-2">
                          <span className="text-lg">{flagEmoji(c.code)}</span>
                          <span>{c.label}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(c.value).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Devices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Devices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.devices}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {data.devices.map((_, i) => (
                          <Cell
                            key={i}
                            fill={COLORS[i % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Browsers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Browsers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.browsers}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="value" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* OS */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Operating Systems</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.oses}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="label"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="value" fill="hsl(var(--accent))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Pages */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Pages</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Path</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pages.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="truncate max-w-[200px] font-mono text-xs">
                          {p.label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(p.value).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Referrers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Referrers</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.referrers.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="truncate max-w-[200px] text-xs">
                          {r.label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(r.value).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Privacy-first analytics — no raw IPs are stored, only coarse
            geolocation and a hashed visitor signal.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1 truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
