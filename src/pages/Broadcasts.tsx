import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Radio, Plus, Users, ChevronRight, Crown, Megaphone, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

interface BroadcastChannel {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  subscriber_count: number;
  last_message?: {
    content: string;
    created_at: string;
  };
}

export default function Broadcasts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [broadcasts, setBroadcasts] = useState<BroadcastChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBroadcasts();
  }, [user]);

  const loadBroadcasts = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Get channels the user owns or subscribes to
      const { data: subscriptions, error: subError } = await supabase
        .from("broadcast_subscribers")
        .select("channel_id")
        .eq("user_id", user.id);

      if (subError) throw subError;

      const { data: ownedChannels, error: ownedError } = await supabase
        .from("broadcast_channels")
        .select("id")
        .eq("owner_id", user.id);

      if (ownedError) throw ownedError;

      const channelIds = [
        ...new Set([
          ...(subscriptions?.map((s) => s.channel_id) || []),
          ...(ownedChannels?.map((c) => c.id) || []),
        ]),
      ];

      if (channelIds.length === 0) {
        setBroadcasts([]);
        setIsLoading(false);
        return;
      }

      // Fetch channel details
      const { data: channels, error: channelsError } = await supabase
        .from("broadcast_channels")
        .select("*")
        .in("id", channelIds);

      if (channelsError) throw channelsError;

      // Fetch subscriber counts and last messages
      const enrichedChannels = await Promise.all(
        (channels || []).map(async (channel) => {
          const { count } = await supabase
            .from("broadcast_subscribers")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", channel.id);

          const { data: lastMsg } = await supabase
            .from("broadcast_messages")
            .select("content, created_at")
            .eq("channel_id", channel.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...channel,
            subscriber_count: count || 0,
            last_message: lastMsg || undefined,
          };
        })
      );

      setBroadcasts(enrichedChannels);
    } catch (error) {
      console.error("Error loading broadcasts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-2xl font-bold text-gradient">Broadcasts</h1>
        </div>
        
        {/* Info banner */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl">
            <Megaphone className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Send messages to many subscribers at once. <span className="text-primary">20 tokens</span> per broadcast.
            </p>
          </div>
        </div>
      </header>

      {/* Broadcast list */}
      {broadcasts.length > 0 ? (
        <div className="p-4 space-y-3">
          {broadcasts.map((broadcast) => (
            <button
              key={broadcast.id}
              onClick={() => navigate(`/broadcast/${broadcast.id}`)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all",
                "bg-card hover:bg-secondary/50 active:scale-[0.98]",
                "border border-border/50"
              )}
            >
              <Avatar className="w-14 h-14">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  <Radio className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold truncate">{broadcast.name}</span>
                  {broadcast.owner_id === user?.id && (
                    <Crown className="w-4 h-4 text-warning flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate mb-1">
                  {broadcast.last_message?.content || broadcast.description || "No messages yet"}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>{broadcast.subscriber_count.toLocaleString()} subscribers</span>
                  </div>
                  {broadcast.last_message && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(broadcast.last_message.created_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No broadcasts yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first broadcast channel
          </p>
        </div>
      )}

      {/* FAB */}
      <Button
        size="icon"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-gradient-primary hover:opacity-90 shadow-glow z-40"
        onClick={() => navigate("/broadcast/create")}
      >
        <Plus className="w-6 h-6" />
      </Button>
    </AppLayout>
  );
}
