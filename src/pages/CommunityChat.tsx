import { useRef, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageComposer } from "@/components/chat/MessageComposer";
import {
  ArrowLeft,
  Users,
  MoreVertical,
  Loader2,
  MessageSquare,
  LogOut,
  UserPlus,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useCommunityMessages,
  useSendCommunityMessage,
  useCommunityMembers,
} from "@/hooks/useCommunities";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

export default function CommunityChat() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: community, isLoading: communityLoading } = useQuery({
    queryKey: ["community", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: messages = [], isLoading: msgsLoading } = useCommunityMessages(id);
  const { data: members = [] } = useCommunityMembers(id);
  const sendMessage = useSendCommunityMessage();

  const isLoading = communityLoading || msgsLoading;
  const currentMember = members.find((m) => m.user_id === user?.id);
  const isAdmin = currentMember?.role === "admin";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!id) return;
    try {
      await sendMessage.mutateAsync({ communityId: id, content });
    } catch (error) {
      toast({
        title: "Failed to send",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const handleLeave = async () => {
    if (!id || !user) return;
    try {
      await supabase
        .from("community_members")
        .delete()
        .eq("community_id", id)
        .eq("user_id", user.id);
      toast({ title: "Left community" });
      navigate("/communities");
    } catch {
      toast({ title: "Failed to leave", variant: "destructive" });
    }
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const groupMessagesByDate = () => {
    const groups: { date: string; messages: typeof messages }[] = [];
    let currentDate = "";
    messages.forEach((msg) => {
      const msgDate = formatMessageDate(msg.created_at);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-2 py-2 glass-strong border-b border-border/50 z-40">
        <Button variant="ghost" size="icon" onClick={() => navigate("/communities")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="w-10 h-10">
            <AvatarImage src={community?.avatar_url || ""} />
            <AvatarFallback className="bg-accent text-accent-foreground">
              {(community?.name || "C").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 text-left">
            <h2 className="font-semibold truncate">{community?.name}</h2>
            <p className="text-xs text-muted-foreground">
              {members.length} members
            </p>
          </div>
        </div>

        {/* Members sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Users className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Members ({members.length})</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-2 rounded-lg"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">
                      {(m.profile?.display_name || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.profile?.display_name || "Unknown"}
                      {m.user_id === user?.id && " (You)"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {m.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isAdmin && (
              <DropdownMenuItem onClick={handleLeave}>
                <LogOut className="w-4 h-4 mr-2" />
                Leave Community
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No messages yet</h3>
            <p className="text-sm text-muted-foreground">
              Be the first to say something!
            </p>
          </div>
        ) : (
          groupMessagesByDate().map((group) => (
            <div key={group.date}>
              <div className="flex justify-center mb-4">
                <span className="px-3 py-1 text-xs text-muted-foreground bg-secondary rounded-full">
                  {group.date}
                </span>
              </div>
              {group.messages.map((message) => {
                const isOther = message.sender_id !== user?.id;
                return (
                  <MessageBubble
                    key={message.id}
                    id={message.id}
                    content={message.content}
                    timestamp={format(new Date(message.created_at), "h:mm a")}
                    isSent={!isOther}
                    isRead={true}
                    isDelivered={true}
                    showSender={isOther}
                    senderName={isOther ? message.sender?.display_name || "Unknown" : undefined}
                    senderAvatar={isOther ? message.sender?.avatar_url || undefined : undefined}
                    onReply={() => {}}
                    onDelete={() => {}}
                    onStar={() => {}}
                    onPin={() => {}}
                    onReact={() => {}}
                    onForward={() => {}}
                    onReport={() => {}}
                    onEdit={() => {}}
                  />
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageComposer
        onSend={handleSendMessage}
        disabled={sendMessage.isPending}
        placeholder={sendMessage.isPending ? "Sending..." : "Type a message..."}
      />
    </div>
  );
}
