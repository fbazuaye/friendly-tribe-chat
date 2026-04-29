import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Radio, Users, Send, Loader2, Crown, LogOut, Zap, Clock, Coins } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface BroadcastMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  message_type: string;
}

interface ChannelInfo {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  subscriber_count: number;
  is_subscribed: boolean;
}

export default function BroadcastChannel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [audienceStats, setAudienceStats] = useState<{ audience: number; pushReady: number } | null>(null);
  const [isLoadingAudience, setIsLoadingAudience] = useState(false);

  const isOwner = user?.id === channel?.owner_id;

  const formatCompact = (n: number) => {
    if (n < 1000) return n.toLocaleString();
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  };

  const estimateDelivery = (pushReady: number) => {
    if (pushReady === 0) return "—";
    if (pushReady < 500) return "~instant";
    if (pushReady <= 5000) return `~${Math.ceil(pushReady / 500)}s`;
    return `~${Math.ceil(pushReady / 30000)}m`;
  };

  const loadAudienceStats = async (channelId: string) => {
    setIsLoadingAudience(true);
    try {
      const { data, error } = await supabase.rpc("get_broadcast_audience_stats", {
        _channel_id: channelId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setAudienceStats({
          audience: Number((row as any).audience_size ?? 0),
          pushReady: Number((row as any).push_ready ?? 0),
        });
      }
    } catch (err) {
      console.error("Error loading audience stats:", err);
    } finally {
      setIsLoadingAudience(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadChannel();
      loadMessages();
    }
  }, [id]);

  // Realtime subscription for new broadcast messages
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`broadcast-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "broadcast_messages",
          filter: `channel_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = payload.new as BroadcastMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load audience preview when the owner opens the channel
  useEffect(() => {
    if (channel && user?.id && channel.owner_id === user.id) {
      loadAudienceStats(channel.id);
    }
  }, [channel?.id, channel?.owner_id, user?.id]);

  // Mark broadcast as read when viewing
  useEffect(() => {
    if (!id || !user?.id) return;

    const markAsRead = async () => {
      await supabase
        .from("broadcast_subscribers")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", id)
        .eq("user_id", user.id);

      queryClient.invalidateQueries({ queryKey: ["unread-broadcast-count"] });
    };

    markAsRead();
  }, [id, user?.id, messages]);

  const loadChannel = async () => {
    if (!id) return;

    try {
      const { data: channelData, error: channelError } = await supabase
        .from("broadcast_channels")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (channelError) throw channelError;

      if (!channelData) {
        toast({
          title: "Channel not found",
          description: "This broadcast channel doesn't exist",
          variant: "destructive",
        });
        navigate("/broadcasts");
        return;
      }

      // Check if user is subscribed
      const { data: subscription } = await supabase
        .from("broadcast_subscribers")
        .select("id")
        .eq("channel_id", id)
        .eq("user_id", user?.id)
        .maybeSingle();

      setChannel({
        ...channelData,
        subscriber_count: (channelData as any).subscriber_count ?? 0,
        is_subscribed: !!subscription,
      });
    } catch (error) {
      console.error("Error loading channel:", error);
      toast({
        title: "Error",
        description: "Failed to load channel",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const MESSAGES_PAGE_SIZE = 50;

  const loadMessages = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("broadcast_messages")
        .select("*")
        .eq("channel_id", id)
        .order("created_at", { ascending: false })
        .range(0, MESSAGES_PAGE_SIZE - 1);

      if (error) throw error;
      const msgs = (data || []).reverse();
      setMessages(msgs);
      setHasEarlierMessages((data?.length || 0) >= MESSAGES_PAGE_SIZE);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const loadEarlierMessages = async () => {
    if (!id || isLoadingEarlier || messages.length === 0) return;
    setIsLoadingEarlier(true);

    try {
      const oldestMessage = messages[0];
      const { data, error } = await supabase
        .from("broadcast_messages")
        .select("*")
        .eq("channel_id", id)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .range(0, MESSAGES_PAGE_SIZE - 1);

      if (error) throw error;
      const older = (data || []).reverse();
      setMessages((prev) => [...older, ...prev]);
      setHasEarlierMessages((data?.length || 0) >= MESSAGES_PAGE_SIZE);
    } catch (error) {
      console.error("Error loading earlier messages:", error);
    } finally {
      setIsLoadingEarlier(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!newMessage.trim() || !id || !user || isSending) return;

    setIsSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: {
          channel_id: id,
          content: newMessage.trim(),
          message_type: "text",
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setNewMessage("");
      loadMessages(); // Reload messages

      toast({
        title: "Broadcast sent!",
        description: `Message delivered to ${channel?.subscriber_count || 0} subscribers`,
      });
    } catch (error: any) {
      console.error("Error sending broadcast:", error);
      toast({
        title: "Failed to send broadcast",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleLeaveChannel = async () => {
    if (!id || !user || isLeaving) return;

    setIsLeaving(true);

    try {
      const { error } = await supabase
        .from("broadcast_subscribers")
        .delete()
        .eq("channel_id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Left channel",
        description: `You've left "${channel?.name}"`,
      });

      navigate("/broadcasts");
    } catch (error: any) {
      console.error("Error leaving channel:", error);
      toast({
        title: "Failed to leave",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLeaving(false);
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

  if (!channel) {
    return null;
  }

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/broadcasts")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Radio className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold truncate">{channel.name}</h2>
                {isOwner && <Crown className="w-4 h-4 text-warning flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{channel.subscriber_count} subscribers</span>
              </div>
            </div>
          </div>

          {/* Leave button for non-owners */}
          {!isOwner && channel?.is_subscribed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeaveChannel}
              disabled={isLeaving}
              title="Leave channel"
            >
              {isLeaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hasEarlierMessages && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadEarlierMessages}
              disabled={isLoadingEarlier}
            >
              {isLoadingEarlier ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <Radio className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No broadcasts yet</h3>
            <p className="text-sm text-muted-foreground">
              {isOwner
                ? "Send your first broadcast message!"
                : "Wait for the channel owner to send a message"}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl p-3",
                "bg-primary text-primary-foreground ml-auto"
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className="text-xs opacity-70 mt-1 text-right">
                {format(new Date(message.created_at), "HH:mm")}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer (only for owner) */}
      {isOwner && (
        <div className="sticky bottom-0 border-t border-border/50 bg-background p-3">
          <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-xl">
            <p className="text-xs text-muted-foreground">
              <span className="text-primary font-medium">1 token</span> per broadcast
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder="Type your broadcast message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendBroadcast();
                }
              }}
              className="flex-1"
            />
            <Button
              size="icon"
              className="bg-gradient-primary rounded-full"
              onClick={handleSendBroadcast}
              disabled={!newMessage.trim() || isSending}
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
