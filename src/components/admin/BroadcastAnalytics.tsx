import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, Users, MessageSquare, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

interface ChannelStat {
  id: string;
  name: string;
  subscriber_count: number;
  owner_id: string;
  message_count: number;
  last_broadcast_at: string | null;
}

export function BroadcastAnalytics() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChannelStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totals, setTotals] = useState({ channels: 0, subscribers: 0, messages: 0 });

  useEffect(() => {
    loadAnalytics();
  }, [user]);

  const loadAnalytics = async () => {
    if (!user) return;

    try {
      // Get all channels in the org
      const { data: channelsData, error: chErr } = await supabase
        .from("broadcast_channels")
        .select("id, name, subscriber_count, owner_id");

      if (chErr) throw chErr;

      // Get message counts per channel
      const enriched = await Promise.all(
        (channelsData || []).map(async (ch) => {
          const { count } = await supabase
            .from("broadcast_messages")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", ch.id);

          const { data: lastMsg } = await supabase
            .from("broadcast_messages")
            .select("created_at")
            .eq("channel_id", ch.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...ch,
            subscriber_count: (ch as any).subscriber_count ?? 0,
            message_count: count || 0,
            last_broadcast_at: lastMsg?.created_at || null,
          };
        })
      );

      // Sort by subscriber count descending
      enriched.sort((a, b) => b.subscriber_count - a.subscriber_count);

      setChannels(enriched);
      setTotals({
        channels: enriched.length,
        subscribers: enriched.reduce((sum, c) => sum + c.subscriber_count, 0),
        messages: enriched.reduce((sum, c) => sum + c.message_count, 0),
      });
    } catch (error) {
      console.error("Error loading broadcast analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 text-center">
            <Radio className="w-5 h-5 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{totals.channels}</p>
            <p className="text-xs text-muted-foreground">Channels</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{totals.subscribers.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Subscribers</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 text-center">
            <MessageSquare className="w-5 h-5 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{totals.messages.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Broadcasts</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel breakdown */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Channel Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No broadcast channels yet
            </p>
          ) : (
            channels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Radio className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ch.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{ch.subscriber_count.toLocaleString()} subs</span>
                    <span>·</span>
                    <span>{ch.message_count} msgs</span>
                    {ch.last_broadcast_at && (
                      <>
                        <span>·</span>
                        <span>
                          Last{" "}
                          {formatDistanceToNow(new Date(ch.last_broadcast_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
