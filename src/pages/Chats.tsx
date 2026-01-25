import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatListItem } from "@/components/chat/ChatListItem";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { TokenBalance } from "@/components/ui/TokenBalance";
import { UserPicker } from "@/components/chat/UserPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, PenSquare, Bell, MessageSquare, Loader2 } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

export default function Chats() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserPicker, setShowUserPicker] = useState(false);
  const { data: conversations = [], isLoading } = useConversations();

  const filteredChats = conversations.filter((conv) => {
    const otherParticipant = conv.participants.find((p) => p.user_id !== user?.id);
    const name = conv.is_group 
      ? conv.name 
      : otherParticipant?.profile?.display_name || "Unknown";
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getChatDisplayInfo = (conv: typeof conversations[0]) => {
    const otherParticipant = conv.participants.find((p) => p.user_id !== user?.id);
    
    return {
      id: conv.id,
      name: conv.is_group 
        ? conv.name || "Group Chat"
        : otherParticipant?.profile?.display_name || "Unknown",
      avatar: otherParticipant?.profile?.avatar_url || "",
      lastMessage: conv.last_message?.content || "No messages yet",
      timestamp: conv.last_message 
        ? formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true })
        : "",
      unreadCount: conv.unread_count || 0,
      isOnline: false,
      isRead: conv.unread_count === 0,
      isGroup: conv.is_group,
    };
  };

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
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredChats.length > 0 ? (
        <div className="divide-y divide-border/50">
          {filteredChats.map((conv) => {
            const displayInfo = getChatDisplayInfo(conv);
            return (
              <ChatListItem
                key={conv.id}
                {...displayInfo}
                onClick={() => navigate(`/chat/${conv.id}`)}
              />
            );
          })}
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
        onClick={() => setShowUserPicker(true)}
      >
        <PenSquare className="w-6 h-6" />
      </Button>

      {/* User picker dialog */}
      <UserPicker 
        open={showUserPicker} 
        onOpenChange={setShowUserPicker} 
      />

      {/* Install prompt */}
      <InstallPrompt />
    </AppLayout>
  );
}
