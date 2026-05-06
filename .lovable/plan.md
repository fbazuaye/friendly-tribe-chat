## Goal

When a broadcast channel is created, every member of the organization is automatically subscribed. New members joining the org also get subscribed to all existing channels. Owners stay excluded from being a "subscriber" for delivery counting purposes (existing logic in `get_broadcast_audience_stats` already excludes the owner).

## Changes

### 1. Database migration — auto-subscribe triggers

**Trigger A: on `broadcast_channels` INSERT**
After a channel row is inserted, bulk-insert one `broadcast_subscribers` row for every `profiles.id` where `organization_id = NEW.organization_id`. Use `ON CONFLICT DO NOTHING` so re-runs are safe. The existing `update_broadcast_subscriber_count` trigger will keep `subscriber_count` accurate.

**Trigger B: on `profiles` INSERT/UPDATE of `organization_id`**
When a user joins an org (organization_id transitions from NULL → some org, or changes), insert a `broadcast_subscribers` row for that user for every channel in that org. `ON CONFLICT DO NOTHING`.

Both triggers run as `SECURITY DEFINER` to bypass RLS.

### 2. Backfill existing channels

One-shot insert: for every existing `broadcast_channels` row, insert subscribers for all `profiles` in the same org that aren't already subscribed. Then recompute `subscriber_count` for each channel. This will subscribe the 14 missing members to "Edo Ward 12" and any missing members to "Announcement".

### 3. UI tweak — `DiscoverChannels.tsx`

Since every member will now auto-subscribe to every channel, the Discover page will usually be empty. Update its empty-state copy to reflect this ("You're already subscribed to every channel in your organization") and keep the page functional for edge cases (e.g., a member who manually unsubscribed and wants to rejoin).

The "Users can unsubscribe themselves" RLS policy stays intact, so members can still leave a channel via existing UI.

## Out of scope

- No change to channel creation UI — admins still create channels the same way.
- No change to broadcast send logic — recipient counting already excludes the owner.
- No change to token costs.

## Verification

- After migration, `SELECT count(*) FROM broadcast_subscribers WHERE channel_id='836f031d-...'` should be 15 (all org members) and `subscriber_count` on the channel row should match.
- Create a test channel as super-admin; confirm all 15 members get a subscriber row immediately.
- Join the org with a new test user; confirm they get a row for both channels.
