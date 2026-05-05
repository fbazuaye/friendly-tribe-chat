## Make broadcast delivery & read analytics exportable

Add export options so channel owners can download per-broadcast delivery and read reports.

### What gets exported

For each broadcast message:
- Channel name, sender, sent timestamp, message preview
- Total recipients
- Delivered (push sent)
- Push failed
- Pending / No push device
- Read count + read rate
- Delivery completed timestamp
- Per-subscriber breakdown: name, push status (delivered/failed/no device), read status + last_read_at

### Export formats

- **CSV** — quick spreadsheet import (Excel/Sheets)
- **PDF** — branded report with Pulse logo, footer "Designed by Frank Bazuaye · Powered by LiveGig Ltd", and the same delivery breakdown bars shown in-app

### UI changes

In `src/components/broadcast/BroadcastReceipts.tsx` delivery sheet:
- Add "Export" section at the bottom with two buttons: "Download CSV" and "Download PDF"
- Owner-only (the sheet already is)

In `src/pages/BroadcastChannel.tsx` channel header (owner view):
- Add a menu item "Export channel report" that bundles **all** broadcasts in the channel into one CSV/PDF for the chosen date range (last 7d / 30d / all)

### Backend

New RPC `get_broadcast_message_recipient_breakdown(_message_id uuid)`:
- SECURITY DEFINER, owner-only
- Returns one row per subscriber: `user_id`, `display_name`, `has_push_device` (bool from `push_subscriptions` existence), `read_at` (last_read_at if >= message.created_at, else null)
- Excludes the channel owner

New RPC `get_channel_broadcast_report(_channel_id uuid, _since timestamptz)`:
- SECURITY DEFINER, owner-only
- Returns aggregated stats for every message in the channel since `_since`

### Frontend implementation

- Add `src/lib/broadcastExport.ts` with helpers:
  - `exportMessageCsv(stats, recipients, breakdown)` — builds CSV string, triggers download
  - `exportMessagePdf(...)` — uses `jspdf` + `jspdf-autotable` to render a branded PDF (logo from `/icon-192.png`, header, summary table, recipient table, footer)
  - `exportChannelCsv(rows)` / `exportChannelPdf(rows)` for full-channel reports
- Add `jspdf` and `jspdf-autotable` deps

### Notes

- No new token costs; reports are free.
- All URLs in the PDF footer use https://pulse-im.netlify.app/.
- Bulk SMS not referenced anywhere in this feature.
