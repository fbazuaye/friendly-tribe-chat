import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Radio, Plus, Users, ChevronRight, Crown, Megaphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function Broadcasts() {
  const navigate = useNavigate();

  // Empty state - no mock data
  const broadcasts: Array<{
    id: string;
    name: string;
    subscribers: number;
    avatar: string;
    lastMessage: string;
    timestamp: string;
    isOwner: boolean;
  }> = [];

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-2xl font-bold text-gradient">Broadcasts</h1>
        </div>
        
        {/* Info banner */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl">
            <Megaphone className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Send messages to many subscribers at once. <span className="text-primary">20 tokens</span> per broadcast.
            </p>
          </div>
        </div>
      </header>

      {/* Broadcast list */}
      {broadcasts.length > 0 ? (
        <div className="p-4 space-y-3">
          {broadcasts.map((broadcast) => (
            <button
              key={broadcast.id}
              onClick={() => navigate(`/broadcast/${broadcast.id}`)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all",
                "bg-card hover:bg-secondary/50 active:scale-[0.98]",
                "border border-border/50"
              )}
            >
              <Avatar className="w-14 h-14">
                <AvatarImage src={broadcast.avatar} />
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  <Radio className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold truncate">{broadcast.name}</span>
                  {broadcast.isOwner && (
                    <Crown className="w-4 h-4 text-warning flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate mb-1">
                  {broadcast.lastMessage}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>{broadcast.subscribers.toLocaleString()} subscribers</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{broadcast.timestamp}</span>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No broadcasts yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first broadcast channel
          </p>
        </div>
      )}

      {/* FAB */}
      <Button
        size="icon"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-gradient-primary hover:opacity-90 shadow-glow z-40"
        onClick={() => navigate("/broadcast/create")}
      >
        <Plus className="w-6 h-6" />
      </Button>
    </AppLayout>
  );
}
