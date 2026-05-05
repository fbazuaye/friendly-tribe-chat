## Why the report looks wrong

**Row 1 (Completed · 0 delivered · 4 failed · 3 recipients · 1 read):**
- `push_sent_count` and `push_failed_count` are tallied **per push device**, but "Recipients" counts **unique users**. Three users with multiple devices each can produce 4 failed push attempts. That's why "Failed" exceeds "Recipients".
- "Delivered = 0" with "1 read" is technically correct: every push endpoint rejected the notification, but the user opened the message in-app. The label "Delivered" makes it look broken.

**Rows 2 & 3 ("In progress" with reads):**
- These broadcasts pre-date the delivery-tracking columns (`push_sent_count`, `delivery_completed_at`). Their counters are 0 / null forever, so the report shows them stuck "In progress" even though they were delivered days ago.

## Fix

### 1. Backfill legacy broadcasts (migration)
- Add `delivery_legacy boolean default false` to `broadcast_messages`.
- For rows where `delivery_completed_at` is null and `created_at < now() - interval '1 hour'`:
  - Set `delivery_completed_at = created_at`
  - Set `delivery_legacy = true`
  - Backfill `total_recipients` from current subscriber count (minus owner) when null/0
- Update `get_channel_broadcast_report` and `get_broadcast_message_stats` RPCs to return `delivery_legacy`.

### 2. Count per-user, not per-device (edge functions)
- **`send-push-notification`**: group push subscriptions by `user_id`. A user is:
  - **delivered** — at least one device accepted the push
  - **failed** — they had devices but all rejected
  - **no device** — no push subscription at all
  Return `{ users_delivered, users_failed, users_no_device, devices_attempted }`.
- **`send-broadcast`**: write `users_delivered` into `push_sent_count` and `users_failed` into `push_failed_count`. Guarantees `delivered + failed + no_device ≤ total_recipients`.

### 3. Clarify labels (frontend + exports)
- Rename **"Delivered"** → **"Push delivered"** in:
  - `src/components/broadcast/BroadcastReceipts.tsx` (sheet + breakdown bar)
  - `src/lib/broadcastExport.ts` (CSV headers, PDF tables)
- Add a one-line note under the PDF/CSV channel report header:
  *"Push delivered = recipient devices that accepted the push. Reads = recipients who opened the message in-app. Reads can occur without a push delivery."*
- For rows with `delivery_legacy = true`, render status as **"Delivered (legacy)"** instead of a timestamp, so users know tracking wasn't available for those messages.

### 4. Files touched
- New migration: `broadcast_messages` column + backfill + updated RPCs
- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/send-broadcast/index.ts`
- `src/lib/broadcastExport.ts`
- `src/components/broadcast/BroadcastReceipts.tsx`

No new token cost, no UI restructuring — just accurate numbers and clearer labels.