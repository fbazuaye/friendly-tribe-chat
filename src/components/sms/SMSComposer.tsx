import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

export function SMSComposer() {
  const { organizationId } = useUserRole();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [useAllContacts, setUseAllContacts] = useState(true);
  const [manualNumbers, setManualNumbers] = useState("");
  const [contacts, setContacts] = useState<{ phone_number: string; name: string | null }[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  const loadContacts = async () => {
    if (!organizationId || contactsLoaded) return;
    const { data } = await supabase
      .from("sms_contacts")
      .select("phone_number, name")
      .eq("organization_id", organizationId);
    setContacts(data || []);
    setContactsLoaded(true);
  };

  // Load contacts on mount
  useState(() => { loadContacts(); });

  const getRecipients = (): string[] => {
    if (useAllContacts) {
      return contacts.map((c) => c.phone_number);
    }
    return manualNumbers
      .split(/[,\n]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  };

  const handleSend = async () => {
    const recipients = getRecipients();
    if (recipients.length === 0) {
      toast.error("No recipients selected");
      return;
    }
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-sms", {
        body: { message: message.trim(), phoneNumbers: recipients },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(`SMS sent to ${recipients.length} recipient(s)`);
        setMessage("");
        setManualNumbers("");
      } else {
        throw new Error(data?.error || "Failed to send SMS");
      }
    } catch (err: any) {
      console.error("SMS send error:", err);
      toast.error(err.message || "Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  const recipients = getRecipients();
  const charCount = message.length;

  return (
    <div className="space-y-4">
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Compose SMS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recipient selection */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex gap-2">
              <Button
                variant={useAllContacts ? "default" : "outline"}
                size="sm"
                onClick={() => setUseAllContacts(true)}
              >
                <Users className="w-4 h-4 mr-1" />
                All Contacts ({contacts.length})
              </Button>
              <Button
                variant={!useAllContacts ? "default" : "outline"}
                size="sm"
                onClick={() => setUseAllContacts(false)}
              >
                Manual Entry
              </Button>
            </div>

            {!useAllContacts && (
              <Textarea
                placeholder="Enter phone numbers separated by commas or new lines&#10;e.g. +254712345678, +254723456789"
                value={manualNumbers}
                onChange={(e) => setManualNumbers(e.target.value)}
                rows={3}
                className="bg-secondary/30"
              />
            )}

            <p className="text-xs text-muted-foreground">
              {recipients.length} recipient(s) selected
            </p>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="bg-secondary/30"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{charCount} characters</span>
              <span>{Math.ceil(charCount / 160) || 1} SMS part(s)</span>
            </div>
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || recipients.length === 0 || !message.trim()}
            className="w-full bg-gradient-primary"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send to {recipients.length} recipient(s)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
