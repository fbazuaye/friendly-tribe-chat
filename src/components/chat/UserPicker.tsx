import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Loader2 } from "lucide-react";
import { useOrganizationMembers } from "@/hooks/useConversations";
import { useSendMessage } from "@/hooks/useMessages";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UserPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserPicker({ open, onOpenChange }: UserPickerProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const { data: members = [], isLoading } = useOrganizationMembers();
  const sendMessage = useSendMessage();

  const filteredMembers = members.filter((m) =>
    m.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectUser = async (userId: string) => {
    try {
      const result = await sendMessage.mutateAsync({
        recipientId: userId,
        content: "👋",
        messageType: "text",
      });

      onOpenChange(false);
      navigate(`/chat/${result.conversation_id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start conversation",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? "No members found" : "No other members in your organization"}
            </div>
          ) : (
            filteredMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => handleSelectUser(member.id)}
                disabled={sendMessage.isPending}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                  "hover:bg-secondary/50 active:bg-secondary",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {member.display_name?.slice(0, 2).toUpperCase() || "??"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="font-medium">{member.display_name || "Unknown"}</p>
                </div>
                {sendMessage.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
