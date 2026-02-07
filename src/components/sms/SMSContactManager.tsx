import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Contact {
  id: string;
  phone_number: string;
  name: string | null;
}

export function SMSContactManager() {
  const { organizationId } = useUserRole();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const fetchContacts = async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_contacts")
      .select("id, phone_number, name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) console.error("Error fetching contacts:", error);
    setContacts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, [organizationId]);

  const addContact = async () => {
    if (!organizationId || !user || !newPhone.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("sms_contacts").insert({
      organization_id: organizationId,
      phone_number: newPhone.trim(),
      name: newName.trim() || null,
      created_by: user.id,
    });
    if (error) {
      if (error.code === "23505") toast.error("This number already exists");
      else toast.error("Failed to add contact");
    } else {
      toast.success("Contact added");
      setNewName("");
      setNewPhone("");
      fetchContacts();
    }
    setAdding(false);
  };

  const bulkAdd = async () => {
    if (!organizationId || !user) return;
    const lines = bulkInput.split(/[\n,]+/).map((l) => l.trim()).filter((l) => l);
    if (lines.length === 0) return;

    setAdding(true);
    const rows = lines.map((line) => {
      const parts = line.split(/\t|;/).map((p) => p.trim());
      return {
        organization_id: organizationId,
        phone_number: parts[0],
        name: parts[1] || null,
        created_by: user.id,
      };
    });

    const { error, data } = await supabase.from("sms_contacts").upsert(rows, {
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name (optional)</Label>
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
          </div>
          <div className="flex gap-2">
            <Button onClick={addContact} disabled={adding || !newPhone.trim()} size="sm">
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBulk(!showBulk)}>
              <Upload className="w-4 h-4 mr-1" />
              Bulk Import
            </Button>
          </div>

          {showBulk && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label>Paste numbers (one per line, optionally tab/semicolon-separated with name)</Label>
              <Textarea
                placeholder={"+254712345678;John Doe\n+254723456789;Jane Smith\n+254734567890"}
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
                  <div>
                    <p className="font-medium text-sm">{contact.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{contact.phone_number}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
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
