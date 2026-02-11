import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, Reply, Star, Copy, Forward, Pin, Flag, Trash2, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Smile } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"];

interface MessageBubbleProps {
  id: string;
  content: string;
  timestamp: string;
  isSent: boolean;
  isRead?: boolean;
  isDelivered?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
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
  onReact?: (emoji: string) => void;
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
  isPinned = false,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  
  const [deleteOpen, setDeleteOpen] = useState(false);
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


  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    onDelete?.();
    setDeleteOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          "flex gap-2 max-w-[85%] animate-scale-in group",
          isSent ? "ml-auto flex-row-reverse" : "mr-auto"
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          if (!menuOpen) setHovered(false);
        }}
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

          <div className="relative">
            <div
              className={cn(
                "relative px-4 py-2.5 shadow-soft cursor-pointer select-none",
                isSent ? "chat-bubble-sent" : "chat-bubble-received"
              )}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuOpen(true);
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
                {isPinned && (
                  <Pin className="w-3 h-3 text-muted-foreground" />
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

            {/* WhatsApp-style hover chevron dropdown */}
            <DropdownMenu open={menuOpen} onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) setHovered(false);
            }}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "absolute top-1 p-0.5 rounded-full transition-opacity bg-black/10 hover:bg-black/20",
                    isSent ? "right-1" : "right-1",
                    (hovered || menuOpen) ? "opacity-100" : "opacity-0"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(true);
                  }}
                >
                  <ChevronDown className="w-4 h-4 text-foreground/70" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align={isSent ? "end" : "start"} className="w-48 bg-popover z-50">
                <DropdownMenuItem onClick={() => onReply?.()}>
                  <Reply className="w-4 h-4 mr-2" />
                  Reply
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Smile className="w-4 h-4 mr-2" />
                    React
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="p-2">
                    <div className="flex items-center gap-1">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(false);
                            onReact?.(emoji);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => onForward?.()}>
                  <Forward className="w-4 h-4 mr-2" />
                  Forward
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPin?.()}>
                  <Pin className="w-4 h-4 mr-2" />
                  {isPinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStar?.()}>
                  <Star className="w-4 h-4 mr-2" />
                  {isStarred ? "Unstar" : "Star"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!isSent && (
                  <DropdownMenuItem onClick={() => onReport?.()}>
                    <Flag className="w-4 h-4 mr-2" />
                    Report
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

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

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
