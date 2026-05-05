import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  exportChannelCsv,
  exportChannelPdf,
  type ChannelReportRow,
} from "@/lib/broadcastExport";

interface Props {
  channelId: string;
  channelName: string;
}

type Range = "7d" | "30d" | "all";

const since = (r: Range): string => {
  if (r === "all") return new Date(0).toISOString();
  const days = r === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export function ChannelExportMenu({ channelId, channelName }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async (range: Range, kind: "csv" | "pdf") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_channel_broadcast_report", {
        _channel_id: channelId,
        _since: since(range),
      });
      if (error) throw error;
      const rows: ChannelReportRow[] = (data ?? []).map((r: any) => ({
        message_id: r.message_id,
        content: r.content ?? "",
        created_at: r.created_at,
        total_recipients: r.total_recipients,
        push_sent_count: Number(r.push_sent_count ?? 0),
        push_failed_count: Number(r.push_failed_count ?? 0),
        read_count: Number(r.read_count ?? 0),
        delivery_completed_at: r.delivery_completed_at,
        delivery_legacy: !!r.delivery_legacy,
      }));
      if (rows.length === 0) {
        toast({ title: "Nothing to export", description: "No broadcasts in this period." });
        return;
      }
      if (kind === "csv") exportChannelCsv(channelName, rows);
      else await exportChannelPdf(channelName, rows);
      toast({ title: "Report ready", description: `${rows.length} broadcasts exported as ${kind.toUpperCase()}` });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not generate report",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Export channel report" disabled={busy}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export channel report</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["7d", "30d", "all"] as Range[]).map((r) => (
          <DropdownMenuSub key={r}>
            <DropdownMenuSubTrigger>
              {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "All time"}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => run(r, "csv")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run(r, "pdf")}>
                <FileText className="w-4 h-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
