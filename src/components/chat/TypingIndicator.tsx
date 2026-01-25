import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  typingUsers: { id: string; display_name: string | null }[];
  className?: string;
}

export function TypingIndicator({ typingUsers, className }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      const name = typingUsers[0].display_name || "Someone";
      return `${name} is typing`;
    } else if (typingUsers.length === 2) {
      const names = typingUsers
        .map((u) => u.display_name || "Someone")
        .join(" and ");
      return `${names} are typing`;
    } else {
      return "Several people are typing";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground animate-fade-in",
        className
      )}
    >
      <div className="flex gap-1">
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-2 h-2 bg-primary rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="italic">{getTypingText()}</span>
    </div>
  );
}
