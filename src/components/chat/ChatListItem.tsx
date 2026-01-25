import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, CheckCheck, Volume2, VolumeX } from "lucide-react";

interface ChatListItemProps {
  id: string;
  name: string;
  avatar?: string;
  lastMessage: string;
  timestamp: string;
  unreadCount?: number;
  isOnline?: boolean;
  isMuted?: boolean;
  isGroup?: boolean;
  isTyping?: boolean;
  isRead?: boolean;
  onClick?: () => void;
}

export function ChatListItem({
  name,
  avatar,
  lastMessage,
  timestamp,
  unreadCount = 0,
  isOnline = false,
  isMuted = false,
  isGroup = false,
  isTyping = false,
  isRead = false,
  onClick,
}: ChatListItemProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-4 transition-all duration-200",
        "hover:bg-secondary/50 active:bg-secondary/70 active:scale-[0.98]",
        "border-b border-border/50 last:border-b-0"
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="w-12 h-12">
          <AvatarImage src={avatar} alt={name} />
          <AvatarFallback className={cn(
            "text-sm font-medium",
            isGroup ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
          )}>
            {initials}
          </AvatarFallback>
        </Avatar>
        {isOnline && !isGroup && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-background" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn(
            "font-medium truncate",
            unreadCount > 0 && "text-foreground"
          )}>
            {name}
          </span>
          <span className={cn(
            "text-xs flex-shrink-0",
            unreadCount > 0 ? "text-primary font-medium" : "text-muted-foreground"
          )}>
            {timestamp}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1">
            {/* Read status */}
            {!unreadCount && !isTyping && (
              <span className="flex-shrink-0">
                {isRead ? (
                  <CheckCheck className="w-4 h-4 text-primary" />
                ) : (
                  <Check className="w-4 h-4 text-muted-foreground" />
                )}
              </span>
            )}
            
            {/* Message preview */}
            {isTyping ? (
              <div className="flex items-center gap-1">
                <div className="flex gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span className="text-sm text-primary">typing...</span>
              </div>
            ) : (
              <span className={cn(
                "text-sm truncate",
                unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {lastMessage}
              </span>
            )}
          </div>
          
          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isMuted && (
              <VolumeX className="w-4 h-4 text-muted-foreground" />
            )}
            {unreadCount > 0 && (
              <span className="unread-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
