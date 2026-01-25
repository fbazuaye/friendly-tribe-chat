import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatListItem } from "@/components/chat/ChatListItem";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { TokenBalance } from "@/components/ui/TokenBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, PenSquare, Bell } from "lucide-react";

// Demo data
const mockChats = [
  {
    id: "1",
    name: "Sarah Johnson",
    avatar: "",
    lastMessage: "Thanks for the update! Let me know when you're ready 👍",
    timestamp: "2:34 PM",
    unreadCount: 3,
    isOnline: true,
    isRead: false,
  },
  {
    id: "2",
    name: "Design Team",
    avatar: "",
    lastMessage: "Mike: The new mockups look amazing!",
    timestamp: "1:20 PM",
    unreadCount: 12,
    isGroup: true,
    isTyping: true,
  },
  {
    id: "3",
    name: "Alex Chen",
    avatar: "",
    lastMessage: "Voice message (0:34)",
    timestamp: "12:45 PM",
    isOnline: true,
    isRead: true,
  },
  {
    id: "4",
    name: "Community Announcements",
    avatar: "",
    lastMessage: "📢 New feature release coming next week!",
    timestamp: "11:30 AM",
    unreadCount: 1,
    isGroup: true,
    isMuted: true,
  },
  {
    id: "5",
    name: "Emma Wilson",
    avatar: "",
    lastMessage: "Can we schedule a call tomorrow?",
    timestamp: "Yesterday",
    isRead: true,
  },
  {
    id: "6",
    name: "Project Alpha",
    avatar: "",
    lastMessage: "You: I've uploaded the files",
    timestamp: "Yesterday",
    isGroup: true,
    isRead: true,
  },
  {
    id: "7",
    name: "David Park",
    avatar: "",
    lastMessage: "That's hilarious 😂",
    timestamp: "Monday",
    isRead: true,
  },
  {
    id: "8",
    name: "Family Group",
    avatar: "",
    lastMessage: "Mom: Don't forget dinner on Sunday!",
    timestamp: "Monday",
    isGroup: true,
    isRead: true,
  },
];

export default function Chats() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredChats = mockChats.filter((chat) =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-2xl font-bold text-gradient">Chats</h1>
          <div className="flex items-center gap-2">
            <TokenBalance balance={1250} size="sm" />
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
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
      <div className="divide-y divide-border/50">
        {filteredChats.map((chat) => (
          <ChatListItem
            key={chat.id}
            {...chat}
            onClick={() => navigate(`/chat/${chat.id}`)}
          />
        ))}
      </div>

      {/* Empty state */}
      {filteredChats.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No chats found</h3>
          <p className="text-sm text-muted-foreground">
            Try searching with a different keyword
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
