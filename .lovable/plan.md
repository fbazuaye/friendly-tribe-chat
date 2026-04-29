## Goal

Show channel owners an audience preview before sending a broadcast — how many subscribers will receive it, how many have push notifications enabled (instant delivery), and an estimated time for the push fan-out to complete.

## Where it goes

In `src/pages/BroadcastChannel.tsx`, replace the small "1 token per broadcast" pill above the composer (visible only to the owner) with a richer preview row:

```text
[👥 1,240 subscribers] [⚡ 980 push-ready] [⏱ ~3s delivery] [● 1 token]
```

Tap/long-press shows a tooltip explaining what each number means.

## What it shows

1. **Audience size** — total subscribers (excluding the owner). Already in `channel.subscriber_count`; we'll subtract 1 if the owner is also a subscriber.
2. **Push-ready count** — subscribers with at least one row in `push_subscriptions`. Users without push only see the message when they next open the app.
3. **Estimated delivery time** — based on the edge function's batching (`PUSH_BATCH_SIZE = 500`, ~1s per batch round-trip):
   - `< 500 push-ready` → "instant" (~1–2s)
   - `500–5,000` → `~Ns` where N = ceil(pushReady / 500)
   - `> 5,000` → show in minutes: `~Nm` where N = ceil(pushReady / 30000)
4. **Token cost** — keep the existing "1 token" indicator.

## Data fetching

Add a new function `loadAudiencePreview()` in `BroadcastChannel.tsx`, called once when the owner loads the channel and re-run after each successful send (counts can drift as people subscribe/unsubscribe):

- Query 1: `broadcast_subscribers` count where `channel_id = id` and `user_id != owner_id` → audience size.
- Query 2: distinct `user_id` from `push_subscriptions` joined against the subscriber list. Since cross-table joins via PostgREST are awkward here, use a small RPC.

### New RPC: `get_broadcast_audience_stats(_channel_id uuid)`

```sql
create or replace function public.get_broadcast_audience_stats(_channel_id uuid)
returns table(audience_size bigint, push_ready bigint)
language sql stable security definer set search_path = public
as $$
  with subs as (
    select bs.user_id
    from public.broadcast_subscribers bs
    join public.broadcast_channels bc on bc.id = bs.channel_id
    where bs.channel_id = _channel_id
      and bs.user_id <> bc.owner_id
  )
  select
    (select count(*) from subs) as audience_size,
    (select count(distinct ps.user_id)
       from public.push_subscriptions ps
       where ps.user_id in (select user_id from subs)) as push_ready;
$$;
```

Only channel owners need this — RLS isn't an issue because the function is `security definer` and the UI gates the call behind `isOwner`. We could add an `is_channel_owner` guard inside the function but it's strictly informational, so a simple definer is fine.

## UI details

- Render a horizontal row of small pills (matching existing glass styling) above the input. On narrow viewports (< 400px) it wraps to two lines.
- While loading, show skeleton chips so layout doesn't jump.
- Numbers > 999 use compact format (`1.2K`, `12K`).
- After a successful send, refresh the preview (subscriber/push counts may have changed, and the user just saw "delivered to N subscribers").

## Files

- **New migration** — add `get_broadcast_audience_stats` function.
- **Edit** `src/pages/BroadcastChannel.tsx` — add audience-preview state, fetch on mount + after send, render pill row in composer area (owner-only).

## Out of scope

- Real-time updates of the preview as people subscribe (refetch on send is enough; the 30s `useUnreadBroadcastCount` pattern is overkill here).
- Per-user delivery receipts (would need a deliveries table — separate feature).