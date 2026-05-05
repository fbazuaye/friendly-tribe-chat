import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const SITE_URL = "https://pulse-im.netlify.app/";
const FOOTER = "Designed by Frank Bazuaye · Powered by LiveGig Ltd";

export interface MessageStats {
  total_recipients: number | null;
  push_sent_count: number;
  push_failed_count: number;
  read_count: number;
  delivery_completed_at: string | null;
}

export interface RecipientRow {
  user_id: string;
  display_name: string;
  has_push_device: boolean;
  read_at: string | null;
}

export interface ChannelReportRow {
  message_id: string;
  content: string;
  created_at: string;
  total_recipients: number | null;
  push_sent_count: number;
  push_failed_count: number;
  read_count: number;
  delivery_completed_at: string | null;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "broadcast";
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/icon-192.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function pdfHeader(doc: jsPDF, title: string, subtitle?: string) {
  const logo = await loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 40, 32, 36, 36);
    } catch {
      // ignore
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Pulse", 86, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(SITE_URL, 86, 64);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 40, 100);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(subtitle, 40, 116);
    doc.setTextColor(0);
  }
}

function pdfFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(FOOTER, w / 2, h - 24, { align: "center" });
    doc.text(SITE_URL, w / 2, h - 12, { align: "center" });
    doc.text(`Page ${i} of ${pageCount}`, w - 40, h - 12, { align: "right" });
    doc.setTextColor(0);
  }
}

function summarize(stats: MessageStats) {
  const recipients = stats.total_recipients ?? 0;
  const delivered = stats.push_sent_count;
  const failed = stats.push_failed_count;
  const accountedFor = delivered + failed;
  const remaining = Math.max(0, recipients - accountedFor);
  const pending = !stats.delivery_completed_at;
  const noDevice = pending ? 0 : remaining;
  const pendingCount = pending ? remaining : 0;
  const readRate = recipients > 0 ? Math.round((stats.read_count / recipients) * 100) : 0;
  return { recipients, delivered, failed, pendingCount, noDevice, readRate, pending };
}

// ---------- Single message exports ----------

export function exportMessageCsv(opts: {
  channelName: string;
  messageId: string;
  createdAt: string;
  content: string;
  stats: MessageStats;
  recipients: RecipientRow[];
}) {
  const { channelName, messageId, createdAt, content, stats, recipients } = opts;
  const s = summarize(stats);
  const lines: (string | number | null)[][] = [];
  lines.push(["Pulse — Broadcast Delivery Report"]);
  lines.push(["Source", SITE_URL]);
  lines.push([]);
  lines.push(["Channel", channelName]);
  lines.push(["Message ID", messageId]);
  lines.push(["Sent at", format(new Date(createdAt), "yyyy-MM-dd HH:mm:ss")]);
  lines.push(["Content", content]);
  lines.push([]);
  lines.push(["Summary"]);
  lines.push(["Total recipients", s.recipients]);
  lines.push(["Delivered (push sent)", s.delivered]);
  lines.push(["Push failed", s.failed]);
  lines.push(["Pending", s.pendingCount]);
  lines.push(["No push device", s.noDevice]);
  lines.push(["Reads", stats.read_count]);
  lines.push(["Read rate (%)", s.readRate]);
  lines.push([
    "Status",
    stats.delivery_completed_at
      ? `Completed ${format(new Date(stats.delivery_completed_at), "yyyy-MM-dd HH:mm:ss")}`
      : "In progress",
  ]);
  lines.push([]);
  lines.push(["Recipient", "Push device", "Read at"]);
  for (const r of recipients) {
    lines.push([
      r.display_name || r.user_id,
      r.has_push_device ? "Yes" : "No",
      r.read_at ? format(new Date(r.read_at), "yyyy-MM-dd HH:mm:ss") : "Unread",
    ]);
  }
  downloadBlob(
    rowsToCsv(lines),
    `pulse-broadcast-${safeName(channelName)}-${messageId.slice(0, 8)}.csv`,
    "text/csv;charset=utf-8",
  );
}

export async function exportMessagePdf(opts: {
  channelName: string;
  messageId: string;
  createdAt: string;
  content: string;
  stats: MessageStats;
  recipients: RecipientRow[];
}) {
  const { channelName, messageId, createdAt, content, stats, recipients } = opts;
  const s = summarize(stats);
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  await pdfHeader(
    doc,
    "Broadcast Delivery Report",
    `${channelName} · Sent ${format(new Date(createdAt), "PPp")}`,
  );

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Message", 40, 140);
  doc.setFont("helvetica", "normal");
  const wrapped = doc.splitTextToSize(content || "(no content)", 515);
  doc.text(wrapped, 40, 156);
  const afterMsgY = 156 + wrapped.length * 12 + 10;

  autoTable(doc, {
    startY: afterMsgY,
    head: [["Metric", "Value"]],
    body: [
      ["Total recipients", String(s.recipients)],
      ["Delivered (push sent)", `${s.delivered} (${s.recipients ? Math.round((s.delivered / s.recipients) * 100) : 0}%)`],
      ["Push failed", `${s.failed} (${s.recipients ? Math.round((s.failed / s.recipients) * 100) : 0}%)`],
      [s.pending ? "Pending" : "No push device", String(s.pending ? s.pendingCount : s.noDevice)],
      ["Reads", `${stats.read_count} (${s.readRate}% read rate)`],
      [
        "Status",
        stats.delivery_completed_at
          ? `Completed ${format(new Date(stats.delivery_completed_at), "PPp")}`
          : "In progress",
      ],
    ],
    theme: "striped",
    headStyles: { fillColor: [30, 30, 40] },
    styles: { fontSize: 10 },
    margin: { left: 40, right: 40 },
  });

  autoTable(doc, {
    head: [["Recipient", "Push device", "Read at"]],
    body: recipients.map((r) => [
      r.display_name || r.user_id.slice(0, 8),
      r.has_push_device ? "Yes" : "No",
      r.read_at ? format(new Date(r.read_at), "PPp") : "Unread",
    ]),
    theme: "grid",
    headStyles: { fillColor: [30, 30, 40] },
    styles: { fontSize: 9 },
    margin: { left: 40, right: 40 },
  });

  pdfFooter(doc);
  doc.save(`pulse-broadcast-${safeName(channelName)}-${messageId.slice(0, 8)}.pdf`);
}

// ---------- Channel-wide exports ----------

export function exportChannelCsv(channelName: string, rows: ChannelReportRow[]) {
  const lines: (string | number | null)[][] = [];
  lines.push(["Pulse — Broadcast Channel Report"]);
  lines.push(["Source", SITE_URL]);
  lines.push(["Channel", channelName]);
  lines.push(["Generated", format(new Date(), "yyyy-MM-dd HH:mm:ss")]);
  lines.push([]);
  lines.push([
    "Sent at",
    "Message",
    "Recipients",
    "Delivered",
    "Failed",
    "Reads",
    "Read rate %",
    "Completed at",
  ]);
  for (const r of rows) {
    const recipients = r.total_recipients ?? 0;
    const readRate = recipients > 0 ? Math.round((Number(r.read_count) / recipients) * 100) : 0;
    lines.push([
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
      r.content,
      recipients,
      r.push_sent_count,
      r.push_failed_count,
      r.read_count,
      readRate,
      r.delivery_completed_at ? format(new Date(r.delivery_completed_at), "yyyy-MM-dd HH:mm:ss") : "In progress",
    ]);
  }
  downloadBlob(
    rowsToCsv(lines),
    `pulse-channel-${safeName(channelName)}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`,
    "text/csv;charset=utf-8",
  );
}

export async function exportChannelPdf(channelName: string, rows: ChannelReportRow[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  await pdfHeader(
    doc,
    "Broadcast Channel Report",
    `${channelName} · ${rows.length} broadcast${rows.length === 1 ? "" : "s"} · Generated ${format(new Date(), "PPp")}`,
  );

  autoTable(doc, {
    startY: 140,
    head: [["Sent at", "Message", "Recipients", "Delivered", "Failed", "Reads", "Read %", "Status"]],
    body: rows.map((r) => {
      const recipients = r.total_recipients ?? 0;
      const readRate = recipients > 0 ? Math.round((Number(r.read_count) / recipients) * 100) : 0;
      return [
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
        r.content.length > 80 ? r.content.slice(0, 77) + "…" : r.content,
        String(recipients),
        String(r.push_sent_count),
        String(r.push_failed_count),
        String(r.read_count),
        `${readRate}%`,
        r.delivery_completed_at ? "Completed" : "In progress",
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: [30, 30, 40] },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 1: { cellWidth: 280 } },
    margin: { left: 40, right: 40 },
  });

  pdfFooter(doc);
  doc.save(`pulse-channel-${safeName(channelName)}-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}
