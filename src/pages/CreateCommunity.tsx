import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Camera, Loader2, Users } from "lucide-react";
import { useCreateCommunity } from "@/hooks/useCommunities";
import { useOrganizationUsers } from "@/hooks/useOrganizationUsers";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export default function CreateCommunity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { users, loading: usersLoading } = useOrganizationUsers();
  const createCommunity = useCreateCommunity();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const otherUsers = users.filter((u) => u.id !== user?.id);
  const filteredUsers = otherUsers.filter((u) =>
    (u.display_name || "").toLowerCase().includes(memberSearch.toLowerCase())
  );

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image must be under 2MB", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }

    try {
      setUploading(true);
      let avatar_url: string | undefined;

      if (avatarFile && user) {
        const ext = avatarFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("community-avatars")
          .upload(path, avatarFile);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("community-avatars")
          .getPublicUrl(path);
        avatar_url = urlData.publicUrl;
      }

      const community = await createCommunity.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        avatar_url,
        memberIds: selectedMembers,
      });
      toast({ title: "Community created!" });
      navigate(`/community/${community.id}`);
    } catch (error) {
      toast({
        title: "Failed to create community",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/communities")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">New Community</h1>
          <div className="flex-1" />
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createCommunity.isPending || uploading}
            className="bg-gradient-primary hover:opacity-90"
          >
            {createCommunity.isPending || uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Create"
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Avatar & Name */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group"
          >
            <Avatar className="w-16 h-16">
              {avatarPreview && <AvatarImage src={avatarPreview} alt="Community avatar" />}
              <AvatarFallback className="bg-accent text-accent-foreground text-xl">
                {name ? name.slice(0, 2).toUpperCase() : <Camera className="w-6 h-6" />}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />
          </button>
          <div className="flex-1">
            <Input
              placeholder="Community name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-lg font-semibold border-0 border-b border-border rounded-none px-0 focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Description (optional)
          </label>
          <Textarea
            placeholder="What's this community about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-secondary/50 border-0 resize-none"
            rows={3}
          />
        </div>

        {/* Members */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              Add members ({selectedMembers.length} selected)
            </span>
          </div>

          <Input
            placeholder="Search members..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="mb-3 bg-secondary/50 border-0"
          />

          {usersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No members found
            </p>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleMember(u.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                    "hover:bg-secondary/50 active:scale-[0.98]",
                    selectedMembers.includes(u.id) && "bg-primary/10"
                  )}
                >
                  <Checkbox checked={selectedMembers.includes(u.id)} />
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-secondary text-secondary-foreground">
                      {(u.display_name || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-sm">
                      {u.display_name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {u.role}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
