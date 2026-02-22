

# Add Community Badge Notification and Sender Profiles

## What You'll Get

1. **Unread badge on the Communities tab** -- just like the Chats and Broadcasts tabs already have, the Communities icon in the bottom navigation will show a red badge with the total number of unread community messages.

2. **Sender profile shown on each message** -- in the community group chat, every message from another member will display their avatar and name next to the message bubble, so you can clearly see who sent it.

---

## Changes

### 1. Create `useUnreadCommunityCount` hook
A new hook (similar to the existing `useUnreadBroadcastCount`) that:
- Queries all communities the user is a member of
- Counts messages newer than the user's `last_read_at` for each community
- Subscribes to realtime `INSERT` events on `community_messages` so the badge updates instantly
- Returns the total unread community message count

### 2. Update Bottom Navigation (`BottomNav.tsx`)
- Import the new `useUnreadCommunityCount` hook
- Add `badgeKey: "communities"` to the Communities nav item
- Wire up `getBadgeCount` to return the community unread count when `badgeKey` is `"communities"`

### 3. Update `BadgeSync` component
- Include the community unread count in the total PWA app badge count (chats + broadcasts + communities)

### 4. Update Community Chat page (`CommunityChat.tsx`)
- Pass `showSender={true}` and `senderAvatar` to the `MessageBubble` component for messages from other members
- The `MessageBubble` component already supports `showSender`, `senderName`, and `senderAvatar` props -- they just aren't being used for community messages yet
- Each received message will show the sender's avatar and display name above/beside the bubble

---

## Technical Details

- **New file**: `src/hooks/useUnreadCommunityCount.tsx` -- mirrors the pattern from `useUnreadBroadcastCount`, querying `community_members` for `last_read_at` and counting newer rows in `community_messages`
- **BottomNav.tsx**: Add `"communities"` to the `badgeKey` union type and handle it in `getBadgeCount`
- **BadgeSync.tsx**: Import `useUnreadCommunityCount` and add it to the `totalUnread` sum
- **CommunityChat.tsx**: Pass `showSender={true}` and `senderAvatar={message.sender?.avatar_url}` to `MessageBubble` for received messages
- No database or migration changes needed -- all the data (`last_read_at`, `community_messages`, sender profiles) already exists

