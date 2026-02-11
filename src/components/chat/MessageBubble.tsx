import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, Reply, Star, Copy, Forward, Smile, Pin, Flag, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface MessageBubbleProps {
  id: string;
  content: string;
  timestamp: string;
  isSent: boolean;
  isRead?: boolean;
  isDelivered?: boolean;
  isStarred?: boolean;
  senderName?: string;
  senderAvatar?: string;
  replyTo?: {
    name: string;
    content: string;
  };
  reactions?: Array<{
    emoji: string;
    count: number;
  }>;
  showSender?: boolean;
  onReply?: () => void;
  onForward?: () => void;
  onStar?: () => void;
  onReact?: () => void;
  onPin?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

export function MessageBubble({
  content,
  timestamp,
  isSent,
  isRead = false,
  isDelivered = false,
  isStarred = false,
  senderName,
  senderAvatar,
  replyTo,
  reactions,
  showSender = false,
  onReply,
  onForward,
  onStar,
  onReact,
  onPin,
  onReport,
  onDelete,
}: MessageBubbleProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const initials = senderName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  const handleAction = (action: (() => void) | undefined, label: string) => {
    if (action) {
      action();
    } else {
      toast({ title: label, description: "Coming soon" });
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[85%] animate-scale-in",
        isSent ? "ml-auto flex-row-reverse" : "mr-auto"
      )}
    >
      {!isSent && showSender && (
        <Avatar className="w-8 h-8 flex-shrink-0 mt-auto">
          <AvatarImage src={senderAvatar} alt={senderName} />
          <AvatarFallback className="text-xs bg-accent text-accent-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex flex-col gap-1", isSent ? "items-end" : "items-start")}>
        {!isSent && showSender && senderName && (
          <span className="text-xs font-medium text-primary px-1">
            {senderName}
          </span>
        )}

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <div
              className={cn(
                "relative px-4 py-2.5 shadow-soft cursor-pointer select-none",
                isSent ? "chat-bubble-sent" : "chat-bubble-received"
              )}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen(true);
              }}
            >
              {replyTo && (
                <div className={cn(
                  "flex items-center gap-2 mb-2 pb-2 border-b",
                  isSent ? "border-white/20" : "border-border"
                )}>
                  <Reply className="w-3 h-3 rotate-180" />
                  <div className="min-w-0">
                    <p className={cn(
                      "text-xs font-medium",
                      isSent ? "text-white/80" : "text-primary"
                    )}>
                      {replyTo.name}
                    </p>
                    <p className={cn(
                      "text-xs truncate",
                      isSent ? "text-white/60" : "text-muted-foreground"
                    )}>
                      {replyTo.content}
                    </p>
                  </div>
                </div>
              )}

              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {content}
              </p>

              <div className={cn(
                "flex items-center gap-1 mt-1",
                isSent ? "justify-end" : "justify-start"
              )}>
                {isStarred && (
                  <Star className="w-3 h-3 fill-warning text-warning" />
                )}
                <span className={cn(
                  "text-[10px]",
                  isSent ? "text-white/60" : "text-muted-foreground"
                )}>
                  {timestamp}
                </span>
                {isSent && (
                  <span className="ml-0.5">
                    {isRead ? (
                      <CheckCheck className="w-4 h-4 text-white/80" />
                    ) : isDelivered ? (
                      <CheckCheck className="w-4 h-4 text-white/50" />
                    ) : (
                      <Check className="w-4 h-4 text-white/50" />
                    )}
                  </span>
                )}
              </div>
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent align={isSent ? "end" : "start"} className="w-48 bg-popover z-50">
            <DropdownMenuItem onClick={() => handleAction(onReply, "Reply")}>
              <Reply className="w-4 h-4 mr-2" />
              Reply
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction(onReact, "React")}>
              <Smile className="w-4 h-4 mr-2" />
              React
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction(onForward, "Forward")}>
              <Forward className="w-4 h-4 mr-2" />
              Forward
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction(onPin, "Pin")}>
              <Pin className="w-4 h-4 mr-2" />
              Pin
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction(onStar, "Star")}>
              <Star className="w-4 h-4 mr-2" />
              {isStarred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!isSent && (
              <DropdownMenuItem onClick={() => handleAction(onReport, "Report")}>
                <Flag className="w-4 h-4 mr-2" />
                Report
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => handleAction(onDelete, "Delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {reactions && reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {reactions.map((reaction, index) => (
              <span key={index} className="reaction-pill">
                <span>{reaction.emoji}</span>
                {reaction.count > 1 && (
                  <span className="text-muted-foreground">{reaction.count}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
