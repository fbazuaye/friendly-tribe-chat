# Load-test edge function for 1M-member broadcast

Add a super-admin-only edge function that synthesizes fake subscribers on a real channel and (optionally) fires a real broadcast through the queue, so you can watch `BroadcastReceipts` fill in real time.

## New file: `supabase/functions/load-test-broadcast/index.ts`

POST body:
```
{
  "channel_id": "uuid",          // required, must be a channel you own
  "count": 1000000,              // # of fake subscribers to insert (capped at 1,000,000)
  "send_broadcast": true,        // if true, also fire a broadcast through the queue
  "content": "Load test",        // broadcast text (default: "Load test broadcast")
  "cleanup": false               // if true, first delete fake subs (rows with no matching profile) on this channel
}
```

Behavior:
- Authn: requires Bearer token; resolves user via `getClaims`.
- Authz: caller must be `super_admin` of the channel's org **and** the channel owner.
- Generates random UUIDs in 5,000-id batches and calls `bulk_subscribe_users` RPC (already exists, idempotent via `ON CONFLICT DO NOTHING`).
- If `send_broadcast=true`: inserts a `broadcast_messages` row (with `metadata.load_test=true`, no token charge) and seeds an `enqueue_broadcast` `delivery_jobs` row — same path as `send-broadcast`, just bypassing the token gate.
- Returns `{ inserted_fake_subscribers, subscribe_ms, broadcast: { message_id, watch_url }, total_ms }`.

Notes:
- Fake subscribers won't have `push_subscriptions` rows, so they'll be counted as "no-device failures" in `recipients_failed`. That's expected — the goal is to measure enqueue + worker throughput and verify progress bars.
- Cleanup mode deletes any subscriber on the channel whose `user_id` is not in `profiles` for the channel's org (i.e., the load-test artifacts).

## `supabase/config.toml`

Register the new function with `verify_jwt = false` (we validate JWTs in code, matching the project's other functions).

## How to use

1. Open any channel you own as super-admin.
2. From DevTools or curl:
   ```
   await supabase.functions.invoke('load-test-broadcast', {
     body: { channel_id: '<id>', count: 1000000, send_broadcast: true, content: 'Throughput test' }
   })
   ```
3. Watch the message's `BroadcastReceipts` panel — `total_recipients` will tick up as the expander pages, and `Sending… X/Y` will rise as workers drain.
4. When done, call again with `{ channel_id, count: 0, cleanup: true }` to remove the fakes.

## Out of scope

- A UI panel for triggering the load test (curl / DevTools is sufficient for an admin tool).
- Generating fake `push_subscriptions` (would require valid VAPID-encrypted endpoints; not useful for measuring our queue).
