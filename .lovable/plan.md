## Goal
Remove the 11 members the load test bulk-subscribed to the "Announcement" channel on 2026-05-06 at 03:30:13 UTC, leaving only the 4 originally subscribed members.

## Approach
Run a one-shot migration that deletes from `broadcast_subscribers` for that channel where `subscribed_at` is within the load test window, then refresh `subscriber_count`.

```sql
WITH del AS (
  DELETE FROM public.broadcast_subscribers
  WHERE channel_id = 'c662a50f-e66d-4dc9-a189-5287e34a0ac2'
    AND subscribed_at >= '2026-05-06 03:30:00+00'
    AND subscribed_at <  '2026-05-06 03:31:00+00'
  RETURNING 1
)
SELECT COUNT(*) FROM del;

UPDATE public.broadcast_channels
SET subscriber_count = (
  SELECT COUNT(*) FROM public.broadcast_subscribers WHERE channel_id = 'c662a50f-e66d-4dc9-a189-5287e34a0ac2'
)
WHERE id = 'c662a50f-e66d-4dc9-a189-5287e34a0ac2';
```

## Expected result
- 11 rows deleted
- Channel `subscriber_count` returns to 4 (livegigltd, baz_ent, usmaneve, de782e33…)
- Anyone removed can re-subscribe normally from Discover Channels

## Verification
Re-run the audit query — `actual_subs = 4`, `fake_subs = 0`.
