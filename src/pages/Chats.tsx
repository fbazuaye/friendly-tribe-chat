import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatListItem } from "@/components/chat/ChatListItem";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { TokenBalance } from "@/components/ui/TokenBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, PenSquare, Bell, MessageSquare } from "lucide-react";

export default function Chats() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Empty state - no mock data
  const chats: Array<{
    id: string;
    name: string;
    avatar: string;
    lastMessage: string;
    timestamp: string;
    unreadCount?: number;
    isOnline?: boolean;
    isRead?: boolean;
    isGroup?: boolean;
    isTyping?: boolean;
    isMuted?: boolean;
  }> = [];

  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-2xl font-bold text-gradient">Chats</h1>
          <div className="flex items-center gap-2">
            <TokenBalance size="sm" />
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-0"
            />
          </div>
        </div>
      </header>

      {/* Chat list */}
      {filteredChats.length > 0 ? (
        <div className="divide-y divide-border/50">
          {filteredChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              {...chat}
              onClick={() => navigate(`/chat/${chat.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No chats yet</h3>
          <p className="text-sm text-muted-foreground">
            Start a new conversation to get going
          </p>
        </div>
      )}

      {/* FAB */}
      <Button
        size="icon"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-gradient-primary hover:opacity-90 shadow-glow z-40"
        onClick={() => navigate("/chat/new")}
      >
        <PenSquare className="w-6 h-6" />
      </Button>

      {/* Install prompt */}
      <InstallPrompt />
    </AppLayout>
  );
}
