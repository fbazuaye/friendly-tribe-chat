import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Radio, Users, Loader2, UserPlus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

interface DiscoverableChannel {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  subscriber_count: number;
}

export default function DiscoverChannels() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [channels, setChannels] = useState<DiscoverableChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDiscoverableChannels();
  }, [user]);

  const loadDiscoverableChannels = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Get all channels in the user's org
      const { data: allChannels, error: channelsError } = await supabase
        .from("broadcast_channels")
        .select("*");

      if (channelsError) throw channelsError;

      // Get channels the user already subscribes to
      const { data: subscriptions, error: subError } = await supabase
        .from("broadcast_subscribers")
        .select("channel_id")
        .eq("user_id", user.id);

      if (subError) throw subError;

      const subscribedIds = new Set(subscriptions?.map((s) => s.channel_id) || []);

      // Filter out channels the user owns or already subscribes to
      const discoverableChannels = (allChannels || []).filter(
        (channel) => channel.owner_id !== user.id && !subscribedIds.has(channel.id)
      );

      // Fetch subscriber counts
      const enrichedChannels = await Promise.all(
        discoverableChannels.map(async (channel) => {
          const { count } = await supabase
            .from("broadcast_subscribers")
            .select("*", { count: "exact", head: true })
            .eq("channel_id", channel.id);

          return {
            ...channel,
            subscriber_count: count || 0,
          };
        })
      );

      setChannels(enrichedChannels);
    } catch (error) {
      console.error("Error loading discoverable channels:", error);
      toast({
        title: "Error",
        description: "Failed to load channels",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinChannel = async (channel: DiscoverableChannel) => {
    if (!user || joiningChannelId) return;

    setJoiningChannelId(channel.id);

    try {
      const { error } = await supabase.from("broadcast_subscribers").insert({
        channel_id: channel.id,
        user_id: user.id,
      });

      if (error) throw error;

      toast({
        title: "Joined channel!",
        description: `You've joined "${channel.name}"`,
      });

      // Navigate to the channel
      navigate(`/broadcast/${channel.id}`);
    } catch (error: any) {
      console.error("Error joining channel:", error);
      toast({
        title: "Failed to join",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setJoiningChannelId(null);
    }
  };

  const filteredChannels = channels.filter(
    (channel) =>
      channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/broadcasts")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Discover Channels</h1>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </header>

      {/* Channel list */}
      {filteredChannels.length > 0 ? (
        <div className="p-4 space-y-3">
          {filteredChannels.map((channel) => (
            <div
              key={channel.id}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl",
                "bg-card border border-border/50"
              )}
            >
              <Avatar className="w-14 h-14">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  <Radio className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <span className="font-semibold truncate block">{channel.name}</span>
                <p className="text-sm text-muted-foreground truncate mb-1">
                  {channel.description || "No description"}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  <span>{channel.subscriber_count.toLocaleString()} subscribers</span>
                </div>
              </div>

              <Button
                size="sm"
                className="bg-gradient-primary flex-shrink-0"
                onClick={() => handleJoinChannel(channel)}
                disabled={joiningChannelId === channel.id}
              >
                {joiningChannelId === channel.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-1" />
                    Join
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No channels to discover</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? "No channels match your search"
              : "You've joined all available channels in your organization"}
          </p>
        </div>
      )}
    </AppLayout>
  );
}
