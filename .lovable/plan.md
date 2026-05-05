## Broadcast Delivery Receipts

Show channel owners how each broadcast performed, right under the message bubble.

### UI

In `src/pages/BroadcastChannel.tsx`, owner-sent messages get a small status row:

```text
[Broadcast text]
                                   14:32
Delivered 248/250 · 219 push · 173 read
```

- Subtle muted text, icons (Check, Bell, Eye), wraps on small screens.
- Tap opens a Sheet with a labeled breakdown (recipients, push delivered, push failed, reads, completed timestamp).
- Live-updates via realtime on `broadcast_messages` UPDATEs and a 30s read-count refetch while the channel is focused.
- Older messages with `total_recipients = null` show "Stats unavailable".

### Database (migration)

Add to `broadcast_messages`:
- `total_recipients integer` (nullable; set at send time)
- `push_sent_count integer NOT NULL DEFAULT 0`
- `push_failed_count integer NOT NULL DEFAULT 0`
- `delivery_completed_at timestamptz`

RLS: new UPDATE policy allowing channel owners to update their channel's broadcast rows (so the edge function — and only the owner — can persist counts; edge function uses service role anyway).

RPC `get_broadcast_message_stats(_message_id uuid)`:
- SECURITY DEFINER, owner-only (raises if caller isn't the channel owner).
- Returns `total_recipients`, `push_sent_count`, `push_failed_count`, `delivery_completed_at`, plus a live-computed `read_count` from `broadcast_subscribers.last_read_at >= message.created_at` (excluding the owner).

### Edge function: `send-broadcast`

- Before insert: count subscribers minus owner → write `total_recipients` on the new message row.
- Replace the inline push payload with a single call to `send-push-notification` using `{ type: "broadcast", record: { channel_id, sender_id, content } }` (matches existing handler shape, fixes current mismatch where the payload uses an unsupported `subscriptions` field).
- Sum `sent`/`failed` across batches; in `finally`, update the message with `push_sent_count`, `push_failed_count`, `delivery_completed_at`.

### Frontend

New `src/components/broadcast/BroadcastReceipts.tsx`:
- Props: `messageId`, `createdAt`, `channelId`.
- Fetches via `supabase.rpc("get_broadcast_message_stats", { _message_id })`.
- Renders compact line + Sheet with details.
- Hooks into existing realtime channel on `broadcast_messages` UPDATEs to refetch when `delivery_completed_at` lands.

`BroadcastChannel.tsx`:
- Render `<BroadcastReceipts />` under each `isOwner && message.sender_id === user.id` bubble.
- Extend the existing realtime subscription to also listen for `UPDATE` events (currently only INSERT).

### Notes
- No token-cost changes; receipts are free metadata.
- No user-visible pricing.
- Backward-compatible: pre-migration messages simply hide the receipts row.
