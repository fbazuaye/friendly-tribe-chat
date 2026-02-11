import { useRef, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Search,
  Sparkles,
  MessageSquare,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useConversation } from "@/hooks/useConversations";
import { useMessages, useSendMessage, useDeleteMessage, useUpdateMessageMetadata } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { usePresence } from "@/hooks/useUserPresence";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";

interface ReplyTo {
  id: string;
  name: string;
  content: string;
}

export default function ChatConversation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);

  const { data: conversation, isLoading: convLoading } = useConversation(id);
  const { data: messages = [], isLoading: msgsLoading } = useMessages(id);
  const sendMessage = useSendMessage();
  const deleteMessage = useDeleteMessage();
  const updateMetadata = useUpdateMessageMetadata();
  const { typingUsers, setTyping, clearTyping } = useTypingIndicator(id);

  const isLoading = convLoading || msgsLoading;

  const currentUserProfile = conversation?.participants.find(
    (p) => p.user_id === user?.id
  );

  const otherParticipant = conversation?.participants.find(
    (p) => p.user_id !== user?.id
  );

  const isOnline = otherParticipant ? isUserOnline(otherParticipant.user_id) : false;

  const getLastSeenText = () => {
    if (isOnline) return "Online";
    if (otherParticipant?.profile?.last_seen_at) {
      const lastSeen = new Date(otherParticipant.profile.last_seen_at);
      return `Last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`;
    }
    return "Offline";
  };

  const chatInfo = {
    name: conversation?.is_group
      ? conversation.name || "Group Chat"
      : otherParticipant?.profile?.display_name || "Unknown",
    avatar: otherParticipant?.profile?.avatar_url || "",
    isOnline,
    lastSeen: getLastSeenText(),
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!id) return;
    clearTyping();

    const metadata: Record<string, unknown> = {};
    if (replyTo) {
      metadata.reply_to = {
        id: replyTo.id,
        name: replyTo.name,
        content: replyTo.content,
      };
      setReplyTo(null);
    }

    try {
      await sendMessage.mutateAsync({
        conversationId: id,
        content,
        messageType: "text",
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleReply = (message: typeof messages[0]) => {
    const senderName =
      message.sender_id === user?.id
        ? "You"
        : message.sender?.display_name || "Unknown";
    setReplyTo({
      id: message.id,
      name: senderName,
      content: message.content,
    });
  };

  const handleDelete = async (messageId: string) => {
    if (!id) return;
    try {
      await deleteMessage.mutateAsync({ messageId, conversationId: id });
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleToggleMetaFlag = async (message: typeof messages[0], flag: "starred" | "pinned") => {
    if (!id) return;
    const meta = (message.metadata as Record<string, unknown>) || {};
    const current = !!meta[flag];
    try {
      await updateMetadata.mutateAsync({
        messageId: message.id,
        conversationId: id,
        metadata: { ...meta, [flag]: !current },
      });
      toast({ title: current ? `Un${flag}` : flag.charAt(0).toUpperCase() + flag.slice(1) + "red" });
    } catch {
      toast({ title: `Failed to ${flag}`, variant: "destructive" });
    }
  };

  const handleReact = async (message: typeof messages[0], emoji: string) => {
    if (!id) return;
    const meta = (message.metadata as Record<string, unknown>) || {};
    const existingReactions = (meta.reactions as Array<{ emoji: string; userId: string }>) || [];
    const alreadyReacted = existingReactions.find(r => r.emoji === emoji && r.userId === user?.id);
    
    const newReactions = alreadyReacted
      ? existingReactions.filter(r => !(r.emoji === emoji && r.userId === user?.id))
      : [...existingReactions, { emoji, userId: user?.id }];

    try {
      await updateMetadata.mutateAsync({
        messageId: message.id,
        conversationId: id,
        metadata: { ...meta, reactions: newReactions },
      });
    } catch {
      toast({ title: "Failed to react", variant: "destructive" });
    }
  };

  const handleForward = (message: typeof messages[0]) => {
    // Navigate to chats with a forwarding state
    navigate("/chats", { state: { forwardMessage: message.content } });
    toast({ title: "Select a chat to forward to" });
  };

  const handleReport = (message: typeof messages[0]) => {
    toast({ title: "Message reported", description: "Thank you for reporting. We'll review this message." });
  };

  const handleAISummary = () => {
    toast({
      title: "AI Summary",
      description: "Generating conversation summary... This will cost 15 tokens.",
    });
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

  const getReplyTo = (message: typeof messages[0]) => {
    const meta = message.metadata as Record<string, unknown> | null;
    if (meta?.reply_to) {
      const rt = meta.reply_to as { name: string; content: string };
      return { name: rt.name, content: rt.content };
    }
    return undefined;
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
        <Button variant="ghost" size="icon" onClick={() => navigate("/chats")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative">
            <Avatar className="w-10 h-10">
              <AvatarImage src={chatInfo.avatar} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {chatInfo.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {chatInfo.isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-background" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <h2 className="font-semibold truncate">{chatInfo.name}</h2>
            <p className="text-xs text-muted-foreground">{chatInfo.lastSeen}</p>
          </div>
        </div>

        <div className="flex items-center">
          <Button variant="ghost" size="icon">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Phone className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem>
                <Search className="w-4 h-4 mr-2" />
                Search
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAISummary}>
                <Sparkles className="w-4 h-4 mr-2" />
                AI Summary
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
              Send a message to start the conversation
            </p>
          </div>
        ) : (
          <>
            {groupMessagesByDate().map((group) => (
              <div key={group.date}>
                <div className="flex justify-center mb-4">
                  <span className="px-3 py-1 text-xs text-muted-foreground bg-secondary rounded-full">
                    {group.date}
                  </span>
                </div>

                {group.messages.map((message) => {
                  const meta = (message.metadata as Record<string, unknown>) || {};
                  const rawReactions = (meta.reactions as Array<{ emoji: string; userId: string }>) || [];
                  const reactionCounts = rawReactions.reduce<Record<string, number>>((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                    return acc;
                  }, {});
                  const reactions = Object.entries(reactionCounts).map(([emoji, count]) => ({ emoji, count }));

                  return (
                    <MessageBubble
                      key={message.id}
                      id={message.id}
                      content={message.content}
                      timestamp={format(new Date(message.created_at), "h:mm a")}
                      isSent={message.sender_id === user?.id}
                      isRead={message.is_read}
                      isDelivered={true}
                      isStarred={!!meta.starred}
                      isPinned={!!meta.pinned}
                      replyTo={getReplyTo(message)}
                      reactions={reactions.length > 0 ? reactions : undefined}
                      senderName={
                        conversation?.is_group && message.sender_id !== user?.id
                          ? message.sender?.display_name || "Unknown"
                          : undefined
                      }
                      onReply={() => handleReply(message)}
                      onDelete={() => handleDelete(message.id)}
                      onStar={() => handleToggleMetaFlag(message, "starred")}
                      onPin={() => handleToggleMetaFlag(message, "pinned")}
                      onReact={(emoji) => handleReact(message, emoji)}
                      onForward={() => handleForward(message)}
                      onReport={() => handleReport(message)}
                    />
                  );
                })}
              </div>
            ))}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      <TypingIndicator typingUsers={typingUsers} />

      <MessageComposer
        onSend={handleSendMessage}
        onTyping={() => setTyping(currentUserProfile?.profile?.display_name)}
        disabled={sendMessage.isPending}
        placeholder={sendMessage.isPending ? "Sending..." : "Type a message..."}
        replyingTo={replyTo ? { name: replyTo.name, content: replyTo.content } : undefined}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
