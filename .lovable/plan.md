## Goal

Add a professional **Analytics** view next to the Bulk SMS *History* tab — moving beyond just "sent" to show real carrier-level delivery outcomes per campaign and across the org.

## What clients will see

A new **Analytics** tab in `/bulk-sms` with:

1. **Org-level KPI strip** (last 30 days, switchable to 7d / 90d / All):
   - Messages submitted
   - Delivered
   - Undelivered (carrier rejected after submission)
   - Failed (never accepted)
   - **Delivery rate %** (delivered ÷ submitted)
   - Active recipients reached (unique numbers)

2. **Delivery funnel chart** — Submitted → Sent → Delivered, with drop-off visualized.

3. **Daily volume + delivery-rate trend** (line/bar combo, last 30 days).

4. **Top failure reasons** — grouped by Twilio error code with friendly labels (e.g. "Landline / unreachable", "Invalid number", "Carrier filtered", "Blacklisted"). Helps clients clean their list.

5. **Per-campaign drill-down** (click any row in History → opens analytics for that send):
   - Stat tiles: Recipients, Sent, Delivered, Undelivered, Failed, Pending, Delivery rate
   - Mini timeline (deliveries over the first 60 min after send)
   - Failure-reason table
   - Per-recipient table (paginated, exportable to CSV): number, status, error code, error message, timestamps

### Honest scoping note

SMS does **not** support a "read" receipt (that's a WhatsApp/RCS feature). What carriers do return via Twilio is **delivered / undelivered / failed**, plus an error code when applicable. The dashboard will label these correctly so we never promise something the channel can't deliver. If the client later wants true read receipts, we'd add a WhatsApp channel — out of scope here.

## How it works (technical)

### 1. Capture per-recipient status

Today `deliver-batch` sends each SMS through the Twilio gateway and stashes the result inside `sms_logs.response_data.recipients` (capped at 1000 entries). That's lossy and not queryable.

Add a proper table:

```
sms_recipients
  id, sms_log_id (fk), organization_id, phone_number,
  message_sid (Twilio SID), status (queued|sent|delivered|undelivered|failed),
  error_code, error_message,
  submitted_at, sent_at, delivered_at, updated_at
```
Indexes on `sms_log_id`, `organization_id + created_at`, `status`. RLS: org admins only.

`deliver-batch` writes one row per recipient at submit time with the returned SID + initial status, instead of appending to JSONB.

### 2. Receive Twilio status callbacks

New edge function `twilio-sms-status` (public, `verify_jwt = false`, signature-verified using Twilio's X-Twilio-Signature header + Auth Token) that:
- Accepts Twilio's `application/x-www-form-urlencoded` callbacks
- Looks up `sms_recipients` by `MessageSid` and updates `status`, `error_code`, `error_message`, `delivered_at`
- Atomically increments rollups on `sms_logs` (new columns `delivered_count`, `undelivered_count`)

`deliver-batch` adds `StatusCallback=<edge-function-url>` to each Twilio request so the callbacks fire.

### 3. Add aggregate columns + RPCs

Migration adds to `sms_logs`: `delivered_count int default 0`, `undelivered_count int default 0`.

Two read-only RPCs (security definer, org-admin gated):
- `get_sms_org_analytics(_org_id, _from, _to)` → totals, daily series, top error codes
- `get_sms_campaign_analytics(_sms_log_id)` → per-campaign stats + funnel + top errors

### 4. Frontend

- New tab `Analytics` in `src/pages/BulkSMS.tsx` (`MessageSquare/Users/History/BarChart3` icons).
- New component `src/components/sms/SMSAnalytics.tsx` — KPI cards, recharts line + bar, error-reason table, range selector (7/30/90/all).
- New component `src/components/sms/SMSCampaignDetail.tsx` — opened from a row in `SMSHistory` (clickable row → drawer/sheet) showing campaign drill-down with recipient table + CSV export.
- `SMSHistory.tsx` gets small status pills updated to show *delivered / failed* breakdown (using the new aggregates) and a "View analytics" affordance.

Design uses existing glass tokens, `text-gradient`, recharts already in the project — no new deps.

## Files touched

- **New migration** — `sms_recipients` table + RLS, two analytics RPCs, `sms_logs.delivered_count/undelivered_count`.
- **New edge function** — `supabase/functions/twilio-sms-status/index.ts` (+ `supabase/config.toml` entry with `verify_jwt = false`).
- **Edit** — `supabase/functions/deliver-batch/index.ts` (insert into `sms_recipients`, add `StatusCallback`).
- **Edit** — `src/pages/BulkSMS.tsx` (add Analytics tab).
- **New** — `src/components/sms/SMSAnalytics.tsx`, `src/components/sms/SMSCampaignDetail.tsx`.
- **Edit** — `src/components/sms/SMSHistory.tsx` (row click → drill-down; show delivered/failed pills).

## Out of scope

- Read receipts (not supported on SMS).
- WhatsApp channel.
- Changing how messages are composed or how contacts are uploaded.
- Backfilling delivery status for historical sends (we only have Twilio SIDs going forward; old sends will show as "Sent" with no delivery telemetry).
