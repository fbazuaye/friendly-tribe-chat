
# Fix PWA Home Screen Badge to Show Unread Messages

## Problem
The Pulse app icon on the home screen does not show a badge count for unread messages. The current implementation only tracks messages received while the app is backgrounded using a local counter that resets, and clears the badge immediately when the app is opened -- regardless of whether messages were actually read.

## Solution
Connect the PWA app badge to the **actual** unread message count from the database (the same count shown on the Chats and Broadcasts tabs inside the app). This way, the home screen icon always reflects the true number of unread messages.

## Changes

### 1. Update `usePushNotifications.tsx`
- Remove the local `unreadCount` variable and the logic that only sets the badge when `document.hidden`.
- Accept the **real total unread count** (chats + broadcasts) as input, and call `setAppBadge()` whenever that count changes.
- Stop clearing the badge on `visibilitychange` -- instead, let the badge naturally go to zero when the user reads all their messages.

### 2. Update `App.tsx` (or the layout that wraps authenticated pages)
- Compute the combined unread count using `useUnreadCount()` + `useUnreadBroadcastCount()`.
- Pass this combined count to `usePushNotifications` so it can keep the PWA badge in sync.
- This ensures the badge updates in real-time as new messages arrive **and** as messages are marked read.

## How It Works After the Fix

1. User receives a message while the app is closed or in the background.
2. The realtime subscription fires, React Query refetches the unread count.
3. The updated total count is passed to the badge API, and the home screen icon shows the correct number.
4. When the user opens a conversation and reads messages, the count decreases and the badge updates (or disappears when all are read).

## Technical Details

- The `setBadgeCount` function will be called inside a `useEffect` that watches the total unread count.
- Notifications will still be shown independently when new messages arrive while the app is backgrounded.
- The service worker `SET_BADGE` message will still be used as a fallback for background updates.
- No database changes are required.
