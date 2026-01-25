import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageComposer } from "@/components/chat/MessageComposer";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Search,
  Info,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  isSent: boolean;
  isRead: boolean;
  isDelivered?: boolean;
  senderName?: string;
  reactions?: Array<{ emoji: string; count: number }>;
  replyTo?: { name: string; content: string };
}

export default function ChatConversation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ name: string; content: string } | null>(null);

  // Chat info would come from database
  const chatInfo = {
    name: "New Conversation",
    avatar: "",
    isOnline: false,
    lastSeen: "Offline",
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSent: true,
      isRead: false,
      isDelivered: false,
      ...(replyingTo && { replyTo: replyingTo }),
    };
    
    setMessages((prev) => [...prev, newMessage]);
    setReplyingTo(null);

    // Simulate delivery after 1s
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === newMessage.id ? { ...m, isDelivered: true } : m
        )
      );
    }, 1000);
  };

  const handleAISummary = () => {
    toast({
      title: "AI Summary",
      description: "Generating conversation summary... This will cost 15 tokens.",
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-2 py-2 glass-strong border-b border-border/50 z-40">
        <Button variant="ghost" size="icon" onClick={() => navigate("/chats")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <button
          className="flex items-center gap-3 flex-1 min-w-0"
          onClick={() => navigate(`/chat/${id}/info`)}
        >
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
        </button>

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
              <DropdownMenuItem onClick={() => navigate(`/chat/${id}/info`)}>
                <Info className="w-4 h-4 mr-2" />
                Contact info
              </DropdownMenuItem>
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
            {/* Date separator */}
            <div className="flex justify-center">
              <span className="px-3 py-1 text-xs text-muted-foreground bg-secondary rounded-full">
                Today
              </span>
            </div>

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                {...message}
              />
            ))}
          </>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        onSend={handleSendMessage}
        replyingTo={replyingTo ?? undefined}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
