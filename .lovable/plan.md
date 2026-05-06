# Scale broadcasts and SMS to 1M recipients

Implement all 5 items from the prior capacity analysis so a single broadcast or SMS blast can reliably fan out to 1M+ recipients.

## 1. Chunked, async enqueue in `send-broadcast`

Currently `send-broadcast` reads all subscribers and inserts all `delivery_jobs` in one synchronous call — fails past ~50k.

Changes to `supabase/functions/send-broadcast/index.ts`:
- After inserting the `broadcast_messages` row and charging the token, do **not** enqueue inline.
- Insert a single seed row into `delivery_jobs` with `job_type = 'enqueue_broadcast'`, `parent_id = message.id`, `payload = { channel_id, message_id, cursor: null, page_size: 5000 }`.
- Return immediately with `{ message_id, status: 'queued' }`.

New handler in `supabase/functions/deliver-batch/index.ts` for `job_type = 'enqueue_broadcast'`:
- Page `broadcast_subscribers` by `(channel_id, id)` cursor, 5,000 rows at a time, excluding the channel owner.
- For each page, insert N `delivery_jobs` rows with `job_type = 'push'` in batches of 100 user_ids per row.
- If more pages remain, insert a follow-up `enqueue_broadcast` job with the next cursor and mark the current one succeeded.
- Update `broadcast_messages.total_recipients` incrementally (`total_recipients = COALESCE(total_recipients,0) + page_count`).

Same pattern for `send-bulk-sms`: seed a single `enqueue_sms` job carrying the contact filter / cursor; expander walks `sms_contacts` in pages and emits `job_type='sms'` rows of 100 phone numbers each.

## 2. Bulk subscriber import (admin)

For 1M-member channels, per-row inserts via UI + trigger don't scale.

DB migration:
- New SECURITY DEFINER RPC `bulk_subscribe_users(_channel_id uuid, _user_ids uuid[])`:
  - Authz: caller must be channel owner.
  - `INSERT ... SELECT unnest(_user_ids) ON CONFLICT DO NOTHING`.
  - Recompute `subscriber_count` once at the end with `UPDATE broadcast_channels SET subscriber_count = (SELECT count(*) FROM broadcast_subscribers WHERE channel_id=_channel_id)`.
- Drop the per-row `update_broadcast_subscriber_count` trigger and replace with statement-level recompute, OR keep trigger but have the RPC bypass via `session_replication_role = 'replica'` for that statement (we'll go with statement-level recompute — simpler, safer).

UI: Add "Bulk add subscribers" action in `BroadcastChannel.tsx` admin panel with two modes:
- "Add all org members" (one click).
- CSV upload of phone numbers / emails resolved to user_ids server-side.

Calls a new edge function `bulk-subscribe` that chunks into 5,000-id RPC calls.

## 3. Higher worker throughput

`supabase/functions/dispatch-jobs/index.ts`:
- Raise `CLAIM_LIMIT` from 50 → 200.
- After claiming, fan out `deliver-batch` invocations in parallel batches of 25 (currently sequential `for` loop with `.catch`, which is already non-blocking but unbounded — switch to `Promise.allSettled` over chunks to bound concurrency).

Cron schedule (insert via `psql`-style SQL using `supabase--read_query` is not allowed for writes — handled in default mode):
- Reschedule `dispatch-jobs` from every minute to every 10 seconds via `cron.schedule` (drop + recreate).
- Add a second cron `dispatch-jobs-burst` running every 10s offset by 5s, so effective tick is 5s.

At 200 jobs × 6 ticks/min × 2 workers = 2,400 jobs/min ≈ 240k recipients/min for push, well above the 10k batches needed for 1M.

## 4. Performance indexes

DB migration `add_scale_indexes`:
```sql
create index if not exists idx_broadcast_subscribers_channel_lastread
  on broadcast_subscribers (channel_id, last_read_at);
create index if not exists idx_broadcast_subscribers_channel_id
  on broadcast_subscribers (channel_id, id);  -- cursor pagination
create index if not exists idx_delivery_jobs_parent_status
  on delivery_jobs (parent_id, status);
create index if not exists idx_delivery_jobs_status_next_attempt
  on delivery_jobs (status, next_attempt_at) where status = 'pending';
create index if not exists idx_push_subscriptions_user
  on push_subscriptions (user_id);
create index if not exists idx_sms_contacts_org_id
  on sms_contacts (organization_id, id);  -- cursor pagination
```

Also widen `broadcast_messages.total_recipients` from `integer` to `bigint` (defensive; 1M fits in int but campaigns may exceed).

## 5. Capacity & UX notes

- Update `BroadcastReceipts.tsx` and `SMSHistory.tsx` to show an "Enqueueing…" state while the seed `enqueue_*` job is still pending (i.e. `total_recipients` is null or growing). The existing progress bars already poll `get_delivery_progress` and will pick up jobs as they're created.
- Add a small admin doc note in the Broadcast composer: "Channels with >100k subscribers may take several minutes to fully deliver."
- Memory update: record the new 1M capacity ceiling and the bulk-subscribe path in `mem://constraints/member-capacity-recommendations`.

## Files touched

- `supabase/functions/send-broadcast/index.ts` — switch to seed-job enqueue.
- `supabase/functions/send-bulk-sms/index.ts` — same pattern.
- `supabase/functions/deliver-batch/index.ts` — handle `enqueue_broadcast` and `enqueue_sms` job types with cursor paging.
- `supabase/functions/dispatch-jobs/index.ts` — raise claim limit, bounded parallel dispatch.
- `supabase/functions/bulk-subscribe/index.ts` — new, chunked RPC caller.
- `supabase/config.toml` — register `bulk-subscribe` (verify_jwt default).
- New migration: `bulk_subscribe_users` RPC, statement-level subscriber_count recompute, scale indexes, `total_recipients` → `bigint`.
- Cron reschedule SQL (run via insert tool in default mode, since URLs/keys are project-specific).
- `src/pages/BroadcastChannel.tsx` — "Bulk add subscribers" admin action + CSV upload.
- `src/components/broadcast/BroadcastReceipts.tsx` + `src/components/sms/SMSHistory.tsx` — "Enqueueing…" state.
- `mem://constraints/member-capacity-recommendations` + index update.

## Out of scope

- Replacing Web Push with a dedicated push service (FCM/APNs direct).
- Per-recipient delivery receipts beyond the existing succeeded/failed counts.
- Sharding `delivery_jobs` across multiple tables.
