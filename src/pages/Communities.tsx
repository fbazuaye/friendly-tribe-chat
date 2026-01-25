import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, Users, Crown, ChevronRight, Settings } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const mockCommunities = [
  {
    id: "1",
    name: "Tech Enthusiasts",
    members: 1245,
    avatar: "",
    description: "A community for tech lovers",
    isAdmin: true,
    unread: 5,
  },
  {
    id: "2",
    name: "Design Hub",
    members: 892,
    avatar: "",
    description: "Share and discuss design trends",
    isAdmin: false,
    unread: 12,
  },
  {
    id: "3",
    name: "Startup Founders",
    members: 456,
    avatar: "",
    description: "Connect with fellow entrepreneurs",
    isAdmin: false,
    unread: 0,
  },
  {
    id: "4",
    name: "Faith Community",
    members: 2341,
    avatar: "",
    description: "Worship and fellowship together",
    isAdmin: true,
    unread: 3,
  },
];

export default function Communities() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCommunities = mockCommunities.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-2xl font-bold text-gradient">Communities</h1>
          <Button variant="ghost" size="icon">
            <Settings className="w-5 h-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search communities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-0"
            />
          </div>
        </div>
      </header>

      {/* Community list */}
      <div className="p-4 space-y-3">
        {filteredCommunities.map((community) => (
          <button
            key={community.id}
            onClick={() => navigate(`/community/${community.id}`)}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-2xl transition-all",
              "bg-card hover:bg-secondary/50 active:scale-[0.98]",
              "border border-border/50"
            )}
          >
            <Avatar className="w-14 h-14">
              <AvatarImage src={community.avatar} />
              <AvatarFallback className="bg-accent text-accent-foreground text-lg">
                {community.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold truncate">{community.name}</span>
                {community.isAdmin && (
                  <Crown className="w-4 h-4 text-warning flex-shrink-0" />
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate mb-1">
                {community.description}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{community.members.toLocaleString()} members</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {community.unread > 0 && (
                <span className="unread-badge">{community.unread}</span>
              )}
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredCommunities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No communities found</h3>
          <p className="text-sm text-muted-foreground">
            Join or create a community to get started
          </p>
        </div>
      )}

      {/* FAB */}
      <Button
        size="icon"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-gradient-primary hover:opacity-90 shadow-glow z-40"
        onClick={() => navigate("/community/create")}
      >
        <Plus className="w-6 h-6" />
      </Button>
    </AppLayout>
  );
}
