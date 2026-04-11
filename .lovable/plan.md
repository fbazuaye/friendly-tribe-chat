

# Scale Broadcast System to 12 Million Subscribers

## Problems to fix

1. **Push notification fan-out blocks the response** — The `send-broadcast` edge function loops through all subscribers synchronously before returning. At 12M subscribers, this will timeout (60s limit).
2. **`SELECT COUNT(*)` on subscribers** — `BroadcastChannel.tsx`, `Broadcasts.tsx`, and `DiscoverChannels.tsx` all run `count: 'exact'` queries per channel against `broadcast_subscribers`. At 12M rows, this is extremely slow.
3. **Messages load all at once** — `loadMessages()` in `BroadcastChannel.tsx` fetches every message with no limit or pagination.

## Plan

### Step 1: Database migration
- Add `subscriber_count` column (default 0) to `broadcast_channels`
- Create trigger function `update_broadcast_subscriber_count()` that increments/decrements on INSERT/DELETE to `broadcast_subscribers`
- Backfill existing counts with an UPDATE
- Add index on `broadcast_messages(channel_id, created_at DESC)` for paginated message queries

### Step 2: Async push notification fan-out in `send-broadcast`
- After inserting the broadcast message, return the response immediately to the caller
- Fire push notifications asynchronously using `EdgeRuntime.waitUntil()` (Deno equivalent: the function continues processing after the response is sent)
- Inside the async block, process subscribers in batches of 500, calling `send-push-notification` for each batch
- This prevents the 60s timeout from killing the broadcast

### Step 3: Update `BroadcastChannel.tsx`
- Use `subscriber_count` from `broadcast_channels` table instead of counting subscribers
- Paginate messages: load latest 50 messages, add "Load earlier" button with cursor-based pagination using `created_at`

### Step 4: Update `Broadcasts.tsx`
- Use `subscriber_count` from `broadcast_channels` directly (already fetched in the channel query) instead of per-channel count queries

### Step 5: Update `DiscoverChannels.tsx`
- Same fix: use `subscriber_count` from `broadcast_channels` instead of per-channel count queries

---

### Technical details

**Migration SQL:**
```sql
ALTER TABLE public.broadcast_channels
  ADD COLUMN subscriber_count integer NOT NULL DEFAULT 0;

CREATE INDEX idx_broadcast_messages_channel_created
  ON public.broadcast_messages(channel_id, created_at DESC);

-- Trigger function
CREATE OR REPLACE FUNCTION update_broadcast_subscriber_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE broadcast_channels SET subscriber_count = subscriber_count + 1
    WHERE id = NEW.channel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE broadcast_channels SET subscriber_count = subscriber_count - 1
    WHERE id = OLD.channel_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_broadcast_subscriber_count
AFTER INSERT OR DELETE ON public.broadcast_subscribers
FOR EACH ROW EXECUTE FUNCTION update_broadcast_subscriber_count();

-- Backfill
UPDATE broadcast_channels bc SET subscriber_count = (
  SELECT COUNT(*) FROM broadcast_subscribers bs WHERE bs.channel_id = bc.id
);
```

**Edge function change (`send-broadcast`):**
- Move the entire push fan-out `while` loop into a detached async block using `setTimeout(() => { ... }, 0)` pattern (Deno edge functions continue executing background work after returning a response)
- The broadcast message insert + token deduction remain synchronous

**Frontend changes:**
- `BroadcastChannel.tsx`: select `subscriber_count` from channel, paginate messages with `.range(0, 49)` and a "Load earlier" button
- `Broadcasts.tsx`: remove per-channel count queries, use `subscriber_count` from channel select
- `DiscoverChannels.tsx`: same removal of per-channel count queries

