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
} from "lucide-react";
import { cn } from "@/lib/utils";
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

// Demo messages
const mockMessages: ChatMessage[] = [
  {
    id: "1",
    content: "Hey! How's the project going? 🚀",
    timestamp: "10:30 AM",
    isSent: false,
    isRead: true,
    senderName: "Sarah Johnson",
  },
  {
    id: "2",
    content: "Going great! Just finished the new design system. Want me to share the preview link?",
    timestamp: "10:32 AM",
    isSent: true,
    isRead: true,
    isDelivered: true,
  },
  {
    id: "3",
    content: "Yes please! I've been looking forward to seeing it",
    timestamp: "10:33 AM",
    isSent: false,
    isRead: true,
    senderName: "Sarah Johnson",
  },
  {
    id: "4",
    content: "Here's the link: pulse-preview.app\n\nLet me know what you think!",
    timestamp: "10:35 AM",
    isSent: true,
    isRead: true,
    isDelivered: true,
  },
  {
    id: "5",
    content: "This looks amazing! 😍 The dark theme is so clean. Love the gradient accents too.",
    timestamp: "10:40 AM",
    isSent: false,
    isRead: true,
    senderName: "Sarah Johnson",
    reactions: [{ emoji: "❤️", count: 1 }],
  },
  {
    id: "6",
    content: "Thanks! The team worked really hard on getting the details right. The animations especially took some time to perfect.",
    timestamp: "10:42 AM",
    isSent: true,
    isRead: true,
    isDelivered: true,
  },
  {
    id: "7",
    content: "I can tell! The transitions feel super smooth. When do you think we can start testing with real users?",
    timestamp: "10:45 AM",
    isSent: false,
    isRead: true,
    senderName: "Sarah Johnson",
  },
  {
    id: "8",
    content: "We're aiming for next week. Just need to finalize the authentication flow and we should be ready for beta.",
    timestamp: "10:47 AM",
    isSent: true,
    isRead: false,
    isDelivered: true,
  },
];

const chatInfo = {
  name: "Sarah Johnson",
  avatar: "",
  isOnline: true,
  lastSeen: "Online",
};

export default function ChatConversation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState(mockMessages);
  const [replyingTo, setReplyingTo] = useState<{ name: string; content: string } | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (content: string) => {
    const newMessage = {
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
