import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Radio, Loader2, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";

export default function CreateBroadcast() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast({
        title: "Access denied",
        description: "Only admins can create broadcast channels",
        variant: "destructive",
      });
      navigate("/broadcasts");
    }
  }, [roleLoading, isAdmin, navigate]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your broadcast channel",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to create a broadcast channel",
        variant: "destructive",
      });
      return;
    }

    if (!isAdmin) {
      toast({
        title: "Access denied",
        description: "Only admins can create broadcast channels",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.organization_id) {
        throw new Error("Could not find your organization");
      }

      // Create the broadcast channel
      const { data: channel, error: channelError } = await supabase
        .from("broadcast_channels")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          owner_id: user.id,
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (channelError) {
        throw channelError;
      }

      // Subscribe owner to their own channel
      await supabase.from("broadcast_subscribers").insert({
        channel_id: channel.id,
        user_id: user.id,
      });

      toast({
        title: "Channel created!",
        description: "Your broadcast channel is ready to use",
      });

      navigate(`/broadcast/${channel.id}`);
    } catch (error: any) {
      console.error("Error creating broadcast channel:", error);
      toast({
        title: "Failed to create channel",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="font-semibold mb-2">Access Denied</h3>
          <p className="text-sm text-muted-foreground">
            Only admins can create broadcast channels
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/broadcasts")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Create Broadcast</h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Radio className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Channel Name</Label>
            <Input
              id="name"
              placeholder="e.g., Company Announcements"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="What's this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
        </div>

        {/* Info */}
        <div className="p-4 bg-secondary/50 rounded-xl text-sm text-muted-foreground">
          <p>
            As the channel owner, you'll be able to send broadcast messages to all
            subscribers. Each broadcast costs <span className="text-primary font-medium">1 token</span>.
          </p>
        </div>

        {/* Create Button */}
        <Button
          className="w-full bg-gradient-primary"
          onClick={handleCreate}
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Channel"
          )}
        </Button>
      </div>
    </AppLayout>
  );
}
