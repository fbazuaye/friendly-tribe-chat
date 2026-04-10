

# Scale Pulse Community to Millions of Members

## Current Bottlenecks

Your app has several patterns that break beyond ~1,000 members:

1. **`useOrganizationUsers`** — fetches ALL profiles, roles, and allocations in one shot (hits Supabase's 1,000-row default limit)
2. **`useCommunities`** — counts members per community with individual queries (N+1 pattern)
3. **`useUnreadCommunityCount`** — loops through every membership to count unread messages
4. **Admin UserManagement** — renders all users in a single list with no pagination
5. **Broadcast delivery** — `send-broadcast` edge function inserts a message but has no batched push notification fan-out for large subscriber lists
6. **No database indexes** — queries on `organization_id`, `community_id`, `channel_id` across large tables will slow down without proper indexes

## Plan

### Step 1: Add database indexes for scale
Add indexes on the most-queried columns across profiles, community_members, broadcast_subscribers, messages, and other high-traffic tables. This is the single biggest performance win.

### Step 2: Paginate `useOrganizationUsers` hook
Replace the "fetch all" pattern with cursor-based pagination (e.g., 50 users per page). Add search/filter server-side using `.ilike()` so the admin panel works with millions of users without loading them all.

### Step 3: Paginate Admin UserManagement UI
Add a paginated list with search, infinite scroll or "Load More" button, and a total member count display (using `count: 'exact', head: true`).

### Step 4: Optimize `useCommunities` with aggregated counts
Replace per-community member count queries with a single aggregated query using a database function that returns community data with member counts in one call.

### Step 5: Optimize `useUnreadCommunityCount`
Replace the N+1 loop (one query per community) with a single database function that computes all unread counts in one SQL call.

### Step 6: Add batched push notifications for broadcasts
Update `send-broadcast` edge function to fan out push notifications in batches (e.g., 500 subscribers at a time) instead of attempting to notify all at once, preventing timeouts.

### Step 7: Add organization member count tracking
Add a `member_count` column to `organizations` table (updated via trigger on profile join/leave) so you can display counts without `SELECT COUNT(*)` on millions of rows.

### Step 8: Paginate broadcast subscriber lists and community member lists
Update `BroadcastChannel.tsx` and community member views to use paginated queries instead of loading all subscribers/members.

---

### Technical Details

**New database migration includes:**
- Indexes on `profiles(organization_id)`, `community_members(community_id, user_id)`, `broadcast_subscribers(channel_id)`, `messages(conversation_id, created_at)`, `community_messages(community_id, created_at)`
- `member_count` column on `organizations` with increment/decrement trigger
- Database function `get_unread_community_counts(user_id)` replacing N+1 loop
- Database function `get_org_users_paginated(org_id, search_text, page_size, page_offset)` for admin panel

**Edge function changes:**
- `send-broadcast`: batch subscriber lookups (500 at a time) and fan-out push notifications asynchronously

**Frontend changes:**
- `useOrganizationUsers`: accept `page`, `search` params, return `{users, total