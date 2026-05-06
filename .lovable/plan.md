# Scale Broadcasts & SMS to 1M+ Recipients

Goal: replace the current "single edge function loops over every recipient" fan-out with a durable queue + many small parallel workers, so a broadcast or SMS blast to 1M+ users completes reliably without timeouts.

## Why the current system caps out

- `send-broadcast` and `send-bulk-sms` loop through all recipients in one edge function invocation (~150s wall-clock cap, single-process memory).
- No retry/dead-letter pipeline — failures are silently lost; old messages stay stuck at `Status = In progress`.
- Single VAPID key = one origin from the push providers' perspective → rate-limited.
- Realtime channels and the default Cloud DB instance are sized for thousands, not millions, of concurrent users.

## Target architecture

```text
 Admin clicks Send
        │
        ▼
 send-broadcast (enqueue only)
   • inserts broadcast_messages row
   • inserts N rows into delivery_jobs (one per recipient batch of ~100)
   • returns immediately (<1s)
        │
        ▼
 pg_cron every 10s ──► dispatch-jobs edge function
                         • claims up to K pending jobs (SKIP LOCKED)
                         • invokes deliver-batch in parallel (fire-and-forget)
        │
        ▼
 deliver-batch (worker, runs in <30s)
   • sends push/SMS for one batch (~100 recipients)
   • updates job row: status, attempts, error
   • increments broadcast_messages.push_sent_count / push_failed_count
   • on failure: schedules retry with exponential backoff
   • after max attempts: marks dead-lettered
        │
        ▼
 Trigger updates broadcast_messages.delivery_completed_at
   when all jobs for that message are done
```

## Database changes (one migration)

New table `delivery_jobs`:
- `id uuid pk`
- `job_type text` — `'push' | 'sms'`
- `parent_id uuid` — broadcast_messages.id or sms_logs.id
- `organization_id uuid`
- `recipient_user_ids uuid[]` (push) or `phone_numbers text[]` (sms) — batch of ~100
- `payload jsonb` — message content, channel info
- `status text` — `pending | claimed | succeeded | failed | dead`
- `attempts int default 0`
- `max_attempts int default 5`
- `claimed_at timestamptz`, `claimed_by text`
- `next_attempt_at timestamptz default now()`
- `last_error text`
- `created_at`, `updated_at`

Indexes: `(status, next_attempt_at)`, `(parent_id)`.

RLS: service-role only (workers use service key); admins can SELECT their org's jobs for monitoring.

Helper RPCs (security definer):
- `claim_delivery_jobs(_limit int)` — `UPDATE ... SET status='claimed' WHERE id IN (SELECT id FROM delivery_jobs WHERE status='pending' AND next_attempt_at <= now() ORDER BY created_at LIMIT _limit FOR UPDATE SKIP LOCKED) RETURNING *`
- `complete_delivery_job(_id, _success, _sent, _failed, _error)` — updates job + parent counters atomically
- `get_delivery_progress(_parent_id)` — for the UI progress bar

Trigger on `delivery_jobs`: when last non-terminal job for a parent flips to terminal, set `broadcast_messages.delivery_completed_at = now()`.

## Edge function changes

1. **`send-broadcast` (rewrite)** — no more sending. Just:
   - insert `broadcast_messages` row with `total_recipients`
   - chunk subscriber list into batches of 100
   - bulk-insert `delivery_jobs` rows
   - return `{ messageId, jobCount }`

2. **`send-bulk-sms` (rewrite)** — same pattern, batches of 50 (Africa's Talking limit-friendly).

3. **`dispatch-jobs` (new, cron-driven)** — runs every 10s:
   - calls `claim_delivery_jobs(50)`
   - for each claimed job, `fetch(deliver-batch, …)` without `await` (parallel fire-and-forget)
   - returns immediately

4. **`deliver-batch` (new, the actual worker)** — receives one job:
   - if `job_type='push'`: fetch push_subscriptions for the batch, send via web-push
   - if `job_type='sms'`: call Africa's Talking with the batch
   - call `complete_delivery_job` with results
   - on transient failure: bump `attempts`, set `next_attempt_at = now() + 2^attempts minutes`
   - on permanent failure (410 Gone for push): delete the dead subscription

5. **`send-push-notification`** — keep for 1:1 chat pushes; broadcasts no longer call it.

## Cron setup

Enable `pg_cron` + `pg_net`, then:
```sql
select cron.schedule('dispatch-delivery-jobs', '*/10 * * * * *',
  $$ select net.http_post(
       url := '<project>/functions/v1/dispatch-jobs',
       headers := '{"Authorization":"Bearer <anon>"}'::jsonb
     ) $$);
```

## Frontend changes

- `BroadcastReceipts` and `ChannelExportMenu`: poll `get_delivery_progress` instead of reading static counters; show live "Delivered 423,109 / 1,000,000 (42%)" with ETA.
- `SMSHistory`: same progress UI per blast.
- "In progress" status now means "jobs still draining" and actually clears when the trigger fires.

## Infra prerequisites the user must approve separately

These are not code changes — they are Cloud-plan upgrades:
1. **DB instance**: upgrade from default to Large or XL (for 1M active users + job table churn).
2. **Read replica**: optional, for analytics queries during heavy fan-out.
3. **Realtime tier**: upgrade if you want >10k concurrent live subscribers, or accept that live indicators degrade gracefully under load.
4. **Push at extreme scale**: if you hit FCM/APNs per-origin throttling, integrate a managed push service (OneSignal / AWS SNS) — added as a config flag in `deliver-batch`.
5. **Partition** `broadcast_messages` and `page_visits` by month once they exceed ~50M rows (separate later migration).

## Realistic capacity after this rewrite

- **Push broadcast to 1M subscribers**: ~30–60 minutes end-to-end at 50 workers × 100/batch × ~2s each. Reliable, resumable, observable.
- **SMS blast to 1M**: gated by Africa's Talking throughput, typically several hours; same durability guarantees.
- **Per channel subscribers**: limited by DB instance, not fan-out. Large instance comfortably holds 5–10M.

## Rollout

1. Ship migration + new tables (no behavior change yet).
2. Ship `dispatch-jobs` + `deliver-batch` (idle, no jobs yet).
3. Switch `send-broadcast` to enqueue mode behind a feature flag; test with one channel.
4. Cut over `send-bulk-sms`.
5. Remove old synchronous loops from `send-push-notification` broadcast path.
6. Backfill `delivery_completed_at` for stuck legacy messages (mark `delivery_legacy = true`).

## Out of scope for this plan

- Changing the chat (1:1 / community) path — current synchronous `send-push-notification` is fine for those.
- Replacing Web Push with a third-party provider (added later only if throttled).
- UI redesign — only the progress widgets change.

Approve and I'll implement in the order listed above (migration first, then workers, then cutover).
