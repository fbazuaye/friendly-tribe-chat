
# Plan: Enable Users to Join Broadcast Channels

## Current State
- Users can only see channels they own or are already subscribed to
- Only channel owners can add subscribers (via RLS policy)
- No way for regular users to discover or join channels

## Implementation

### 1. Database Changes

**Update RLS Policy on `broadcast_subscribers`**
Add a policy allowing users to subscribe themselves to channels in their organization:

```sql
-- Allow users to subscribe themselves to org channels
CREATE POLICY "Users can subscribe to org channels"
  ON public.broadcast_subscribers FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND 
    EXISTS (
      SELECT 1 FROM public.broadcast_channels bc
      WHERE bc.id = channel_id 
      AND bc.organization_id = get_user_org_id(auth.uid())
    )
  );
```

### 2. Create Channel Discovery Page

**New file: `src/pages/DiscoverChannels.tsx`**

A page that displays all broadcast channels in the user's organization that they haven't subscribed to yet:
- Fetch all channels in the user's organization
- Filter out channels the user already subscribes to
- Show channel name, description, subscriber count
- "Join" button for each channel

### 3. Update Broadcasts Page

**Edit: `src/pages/Broadcasts.tsx`**

Add a "Discover Channels" button/tab:
- Add a secondary button or tab to navigate to `/broadcasts/discover`
- Could be a "Browse Channels" icon button in the header

### 4. Add Subscribe Functionality

**Edit: `src/pages/DiscoverChannels.tsx`**

Subscribe action:
- Insert row into `broadcast_subscribers` with user_id and channel_id
- Show success toast: "You've joined [channel name]!"
- Redirect to the channel or refresh the list

### 5. Add Unsubscribe Option (Optional Enhancement)

**Edit: `src/pages/BroadcastChannel.tsx`**

For non-owners, add a "Leave Channel" option:
- Button in channel header or menu
- Delete the subscriber row (already allowed by RLS: `user_id = auth.uid()`)
- Redirect back to broadcasts list

### 6. Update App Routes

**Edit: `src/App.tsx`**

Add route for the discover page:
```tsx
<Route path="/broadcasts/discover" element={<DiscoverChannels />} />
```

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `src/pages/DiscoverChannels.tsx` | Browse and join available channels |

### Files to Modify
| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/broadcasts/discover` route |
| `src/pages/Broadcasts.tsx` | Add "Discover" navigation button |
| `src/pages/BroadcastChannel.tsx` | Add "Leave Channel" option for subscribers |

### Database Migration
- Add new RLS policy allowing self-subscription to org channels

### User Flow
```text
User opens Broadcasts → Sees "Discover" button → Views available channels
    → Clicks "Join" → Becomes subscriber → Can now see channel messages
```

### Security Considerations
- Users can only join channels within their own organization
- Users can only subscribe themselves (not others)
- Users can unsubscribe themselves from any channel
- Channel owners retain full subscriber management capabilities
