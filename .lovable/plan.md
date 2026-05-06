## Problem

Broadcasts get stuck at "delivery in progress" because the seed `delivery_jobs` row fails to insert. The DB CHECK constraint `delivery_jobs_job_type_check` only permits `'push'` and `'sms'`, but the new pipeline inserts `'enqueue_broadcast'` and `'enqueue_sms'` expander jobs. The error is logged but swallowed, so:

- `broadcast_messages` row is created with `total_recipients = 0`
- No `delivery_jobs` exist for it
- `dispatch-jobs` cron has nothing to claim
- `delivery_completed_at` never gets set → UI shows "delivery in progress" forever
- The 1 token was already consumed

## Fix

### 1. Migration: widen the CHECK constraint
Drop and recreate `delivery_jobs_job_type_check` to allow all four current job types: `'push'`, `'sms'`, `'enqueue_broadcast'`, `'enqueue_sms'`.

### 2. Migration: heal the stuck broadcast(s)
For any `broadcast_messages` row where `delivery_completed_at IS NULL` and no `delivery_jobs` exist for its `id`, mark `delivery_completed_at = now()` and `delivery_legacy = true` so the UI stops showing "in progress". (No retroactive push delivery — the message row exists and subscribers can still see it in-app; resending would double-charge tokens.)

### 3. Make `send-broadcast` fail loudly
If the seed `delivery_jobs` insert errors, refund the consumed token, delete the orphan `broadcast_messages` row, and return `500` with the DB error so the UI surfaces a real failure instead of silently appearing to succeed.

### 4. Verify after deploy
- Send a test broadcast from the Announcement channel.
- Confirm one `enqueue_broadcast` job appears in `delivery_jobs`, dispatcher picks it up, `push` jobs are emitted, and `delivery_completed_at` is set.

## Out of scope
No changes to the dispatch cron, deliver-batch logic, or token costs.
