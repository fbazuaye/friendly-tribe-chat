import { useRef, useEffect } from "react";
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
  Info,
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
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { usePresence } from "@/hooks/useUserPresence";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";

export default function ChatConversation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversation, isLoading: convLoading } = useConversation(id);
  const { data: messages = [], isLoading: msgsLoading } = useMessages(id);
  const sendMessage = useSendMessage();
  const { typingUsers, setTyping, clearTyping } = useTypingIndicator(id);

  const isLoading = convLoading || msgsLoading;

  // Get current user's display name for typing indicator
  const currentUserProfile = conversation?.participants.find(
    (p) => p.user_id === user?.id
  );

  // Get other participant for 1:1 chats
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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!id) return;

    // Clear typing indicator when sending
    clearTyping();

    try {
      await sendMessage.mutateAsync({
        conversationId: id,
        content,
        messageType: "text",
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
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
                {/* Date separator */}
                <div className="flex justify-center mb-4">
                  <span className="px-3 py-1 text-xs text-muted-foreground bg-secondary rounded-full">
                    {group.date}
                  </span>
                </div>

                {group.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    id={message.id}
                    content={message.content}
                    timestamp={format(new Date(message.created_at), "h:mm a")}
                    isSent={message.sender_id === user?.id}
                    isRead={message.is_read}
                    isDelivered={true}
                    senderName={
                      conversation?.is_group && message.sender_id !== user?.id
                        ? message.sender?.display_name || "Unknown"
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      <TypingIndicator typingUsers={typingUsers} />

      {/* Composer */}
      <MessageComposer
        onSend={handleSendMessage}
        onTyping={() => setTyping(currentUserProfile?.profile?.display_name)}
        disabled={sendMessage.isPending}
        placeholder={sendMessage.isPending ? "Sending..." : "Type a message..."}
      />
    </div>
  );
}
