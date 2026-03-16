import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Trash2, Upload, Loader2, FileUp, Mail, Send } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Contact {
  id: string;
  phone_number: string;
  name: string | null;
  email: string | null;
}

export function SMSContactManager() {
  const { organizationId } = useUserRole();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchContacts = async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_contacts")
      .select("id, phone_number, name, email")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) console.error("Error fetching contacts:", error);
    setContacts(data || []);
    setLoading(false);
  };

  const fetchInviteCode = async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("organizations")
      .select("invite_code")
      .eq("id", organizationId)
      .single();
    setInviteCode(data?.invite_code || null);
  };

  useEffect(() => {
    fetchContacts();
    fetchInviteCode();
  }, [organizationId]);

  const addContact = async () => {
    if (!organizationId || !user || !newPhone.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("sms_contacts").insert({
      organization_id: organizationId,
      phone_number: newPhone.trim(),
      name: newName.trim() || null,
      email: newEmail.trim() || null,
      created_by: user.id,
    });
    if (error) {
      if (error.code === "23505") toast.error("This number already exists");
      else toast.error("Failed to add contact");
    } else {
      toast.success("Contact added");
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      fetchContacts();
    }
    setAdding(false);
  };

  const bulkAdd = async () => {
    if (!organizationId || !user) return;
    const lines = bulkInput.split(/[\n]+/).map((l) => l.trim()).filter((l) => l);
    if (lines.length === 0) return;

    setAdding(true);
    const rows = lines.map((line) => {
      const parts = line.split(/\t|;|,/).map((p) => p.trim());
      return {
        organization_id: organizationId,
        phone_number: parts[0],
        name: parts[1] || null,
        email: parts[2] || null,
        created_by: user.id,
      };
    });

    const { error } = await supabase.from("sms_contacts").upsert(rows, {
      onConflict: "organization_id,phone_number",
    });

    if (error) {
      console.error("Bulk add error:", error);
      toast.error("Some contacts could not be added");
    } else {
      toast.success(`${rows.length} contact(s) imported`);
      setBulkInput("");
      setShowBulk(false);
      fetchContacts();
    }
    setAdding(false);
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId || !user) return;

    setAdding(true);
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);

    if (lines.length < 2) {
      toast.error("CSV file is empty or has no data rows");
      setAdding(false);
      return;
    }

    // Parse header to find columns
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
    const phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("tel") || h.includes("number"));
    const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("full"));
    const emailIdx = header.findIndex((h) => h.includes("email") || h.includes("mail"));

    if (phoneIdx === -1) {
      toast.error("CSV must have a column with 'phone', 'mobile', or 'number' in the header");
      setAdding(false);
      return;
    }

    const rows: any[] = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const phone = cols[phoneIdx]?.trim();
      if (!phone) { skipped++; continue; }

      rows.push({
        organization_id: organizationId,
        phone_number: phone,
        name: nameIdx >= 0 ? cols[nameIdx]?.trim() || null : null,
        email: emailIdx >= 0 ? cols[emailIdx]?.trim() || null : null,
        created_by: user.id,
      });
    }

    if (rows.length === 0) {
      toast.error("No valid contacts found in CSV");
      setAdding(false);
      return;
    }

    // Batch insert in chunks of 500
    let imported = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("sms_contacts").upsert(chunk, {
        onConflict: "organization_id,phone_number",
      });
      if (error) {
        console.error("CSV import error:", error);
      } else {
        imported += chunk.length;
      }
    }

    toast.success(`${imported} contact(s) imported${skipped > 0 ? `, ${skipped} skipped` : ""}`);
    fetchContacts();
    setAdding(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendInvites = async () => {
    if (!inviteCode || !organizationId) {
      toast.error("No invite code found for this organization");
      return;
    }

    const phoneContacts = contacts.filter((c) => c.phone_number);
    if (phoneContacts.length === 0) {
      toast.error("No contacts with phone numbers to invite");
      return;
    }

    setInviting(true);
    try {
      const inviteMessage = `You've been invited to join our organization on LiveGig! Download the app and use invite code: ${inviteCode} to get started. https://friendly-tribe-chat.lovable.app`;

      const { data, error } = await supabase.functions.invoke("send-bulk-sms", {
        body: {
          message: inviteMessage,
          phoneNumbers: phoneContacts.map((c) => c.phone_number),
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(`Invite sent to ${phoneContacts.length} contact(s)`);
      } else {
        throw new Error(data?.error || "Failed to send invites");
      }
    } catch (err: any) {
      console.error("Invite send error:", err);
      toast.error(err.message || "Failed to send invites");
    } finally {
      setInviting(false);
    }
  };

  const deleteContact = async (id: string) => {
    const { error } = await supabase.from("sms_contacts").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Contact removed");
      setContacts((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Add single contact */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Add Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                placeholder="John Doe"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-secondary/30"
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                placeholder="+254712345678"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="bg-secondary/30"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                placeholder="john@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="bg-secondary/30"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={addContact} disabled={adding || !newPhone.trim()} size="sm">
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBulk(!showBulk)}>
              <Upload className="w-4 h-4 mr-1" />
              Paste Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="w-4 h-4 mr-1" />
              Upload CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCSVUpload}
            />
          </div>

          {showBulk && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Paste contacts (phone;name;email per line, or comma/tab separated)</Label>
              <Textarea
                placeholder={"+254712345678;John Doe;john@email.com\n+254723456789;Jane Smith;jane@email.com\n+254734567890"}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={5}
                className="bg-secondary/30 text-sm font-mono"
              />
              <Button onClick={bulkAdd} disabled={adding || !bulkInput.trim()} size="sm">
                {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Import Contacts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite all contacts */}
      {contacts.length > 0 && (
        <Card className="glass border-border/50 border-primary/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-medium text-sm">Send Organization Invite</p>
                <p className="text-xs text-muted-foreground">
                  SMS invite code <Badge variant="outline" className="ml-1 font-mono">{inviteCode || "..."}</Badge> to all {contacts.length} contact(s)
                </p>
              </div>
              <Button
                onClick={sendInvites}
                disabled={inviting || !inviteCode}
                size="sm"
                className="bg-gradient-primary"
              >
                {inviting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Send Invites
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact list */}
      <Card className="glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Contacts
            <Badge variant="secondary" className="ml-auto">{contacts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No contacts yet. Add some above!</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{contact.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{contact.phone_number}</p>
                    {contact.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {contact.email}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => deleteContact(contact.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Simple CSV line parser handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
