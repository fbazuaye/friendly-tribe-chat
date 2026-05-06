# Live Delivery Progress Bars

Add a real-time progress bar to broadcast receipts (and SMS history) by polling the new `get_delivery_progress(parent_id)` RPC while delivery is still in progress.

## Changes

### 1. `src/components/broadcast/BroadcastReceipts.tsx`
- Add a `Progress` type matching the RPC return shape (`total_jobs`, `pending`, `claimed`, `succeeded`, `failed`, `dead`, `recipients_sent`, `recipients_failed`).
- Add a second loader `loadProgress()` that calls `supabase.rpc("get_delivery_progress", { _parent_id: messageId })`.
- While `delivery_completed_at` is null, poll both `load()` and `loadProgress()` every 3s; once complete, fall back to 30s and stop polling progress.
- In the trigger button, when delivery is pending, replace `Sending… {recipients}` with a live count: `Sending… {recipients_sent + recipients_failed}/{total_recipients}`.
- In `DeliveryBreakdown`, when `progress` exists and delivery is pending:
  - Show a job-level progress strip above the recipient bar: `{succeeded + failed + dead}/{total_jobs} batches` with a thin progress bar.
  - Use `progress.recipients_sent` / `recipients_failed` for the live numbers (more accurate than the rolled-up counters during fan-out).
- Keep existing post-completion view unchanged.

### 2. `src/components/sms/SMSHistory.tsx`
- For each row whose `status` is `queued` or `sending`, call `get_delivery_progress(_parent_id: smsLog.id)` and render a compact progress bar + `{recipients_sent + recipients_failed}/{recipient_count}` underneath the message preview.
- Poll every 5s while any visible row is still in progress; clear when all rows are settled.
- Add a small "Queued · {pending} batches remaining" / "Delivering…" status pill replacing the static badge while jobs drain.

### 3. (Tiny) shared helper
Inline the RPC call in both files — no new file needed; the shape is small.

## UX details
- Bars use existing semantic tokens (`bg-emerald-500`, `bg-destructive`, `bg-amber-500 animate-pulse` for in-flight) — no new colors.
- Numbers are `tabular-nums` and `.toLocaleString()`-formatted so 1M+ is readable.
- No loading flicker: keep last-known progress while a refresh is in-flight.

## Out of scope
- No DB or edge-function changes — purely UI on top of the already-shipped queue.
- No realtime subscription on `delivery_jobs` (polling is enough at 3–5s; saves a Realtime channel per visible message).
