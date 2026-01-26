import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Radio, Users, Send, Loader2, Crown } from "lucide-react";
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
}

export default function BroadcastChannel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const isOwner = user?.id === channel?.owner_id;

  useEffect(() => {
    if (id) {
      loadChannel();
      loadMessages();
    }
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

      // Get subscriber count
      const { count } = await supabase
        .from("broadcast_subscribers")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", id);

      setChannel({
        ...channelData,
        subscriber_count: count || 0,
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

  const loadMessages = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("broadcast_messages")
        .select("*")
        .eq("channel_id", id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error loading messages:", error);
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
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
