import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Smile,
  Paperclip,
  Mic,
  Send,
  Camera,
  Image as ImageIcon,
  FileText,
  X,
} from "lucide-react";

interface MessageComposerProps {
  onSend: (message: string) => void;
  onTyping?: () => void;
  onAttachmentClick?: () => void;
  onVoiceNote?: () => void;
  placeholder?: string;
  disabled?: boolean;
  replyingTo?: {
    name: string;
    content: string;
  };
  onCancelReply?: () => void;
}

export function MessageComposer({
  onSend,
  onTyping,
  onAttachmentClick,
  onVoiceNote,
  placeholder = "Type a message...",
  disabled = false,
  replyingTo,
  onCancelReply,
}: MessageComposerProps) {
  const [message, setMessage] = useState("");
  const [showAttachments, setShowAttachments] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize
    const target = e.target;
    target.style.height = "auto";
    target.style.height = Math.min(target.scrollHeight, 120) + "px";
    
    // Trigger typing indicator
    onTyping?.();
  };

  const attachmentOptions = [
    { icon: Camera, label: "Camera", color: "text-destructive" },
    { icon: ImageIcon, label: "Gallery", color: "text-primary" },
    { icon: FileText, label: "Document", color: "text-accent" },
  ];

  return (
    <div className="relative">
      {/* Attachment options */}
      {showAttachments && (
        <div className="absolute bottom-full left-0 right-0 p-4 glass-strong animate-slide-up rounded-t-2xl">
          <div className="flex justify-around">
            {attachmentOptions.map((option) => (
              <button
                key={option.label}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-secondary/50 transition-colors"
                onClick={() => {
                  setShowAttachments(false);
                  onAttachmentClick?.();
                }}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center bg-secondary",
                  option.color
                )}>
                  <option.icon className="w-6 h-6" />
                </div>
                <span className="text-xs text-muted-foreground">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-3 px-4 py-3 bg-secondary/50 border-b border-border">
          <div className="w-1 h-10 bg-primary rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary">{replyingTo.name}</p>
            <p className="text-sm text-muted-foreground truncate">{replyingTo.content}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCancelReply}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Composer */}
      <div className="flex items-end gap-2 p-3 bg-card border-t border-border">
        {/* Emoji button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Smile className="w-5 h-5" />
        </Button>

        {/* Input container */}
        <div className="flex-1 flex items-end gap-2 bg-secondary rounded-2xl px-4 py-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-foreground placeholder:text-muted-foreground",
              "resize-none outline-none text-[15px] leading-6 max-h-[120px]",
              "scrollbar-hide"
            )}
          />

          {/* Attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setShowAttachments(!showAttachments)}
          >
            <Paperclip className="w-5 h-5" />
          </Button>
        </div>

        {/* Send or Voice button */}
        {message.trim() ? (
          <Button
            size="icon"
            className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-primary hover:opacity-90"
            onClick={handleSend}
            disabled={disabled}
          >
            <Send className="w-5 h-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onVoiceNote}
          >
            <Mic className="w-5 h-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
