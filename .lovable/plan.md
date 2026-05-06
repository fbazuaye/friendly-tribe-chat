## Problem

The "Enable" button in the bottom notification prompt appears unresponsive when clicked. Root causes:

1. **Silently denied permission**: `Notification.requestPermission()` only shows the browser dialog when permission is `"default"`. If it was previously denied (or the browser blocked it for the site/iframe), the call resolves instantly with `"denied"` and nothing visible happens — looking like a broken button.
2. **No user feedback**: The handler returns silently on failure or denial — no toast, no UI change.
3. **Iframe/preview limitation**: The Lovable preview runs inside an iframe. Browsers (especially Chrome) block `Notification.requestPermission()` inside cross-origin iframes unless the parent grants `notifications` permissions policy. In the in-app preview the prompt simply never appears. The published URL (`friendly-tribe-chat.lovable.app`) opened in a top-level tab works fine.
4. **Unauthenticated state**: The prompt shows on `/auth` before sign-in. Even if permission is granted, `subscribeToPush` skips saving because `user.id` is missing, so the user has to repeat the flow after login.

## Fix

### 1. `src/hooks/usePushNotifications.tsx`
- Make `requestPermission` detect the `"denied"` case and return a structured result: `{ granted: boolean; reason?: 'denied' | 'unsupported' | 'blocked' | 'error' }`.
- Wrap `Notification.requestPermission()` in a try/catch that also catches the `NotImplementedError` / `SecurityError` thrown inside iframes; surface as `reason: 'blocked'`.
- After permission is granted, also re-check `subscription.enabled` so the auto-subscribe `useEffect` fires once the user logs in.

### 2. `src/components/notifications/NotificationPrompt.tsx`
- On click, await the new structured result and show a toast (sonner) for each branch:
  - `granted` → success toast "Notifications enabled".
  - `denied` → warning toast with instructions: "Notifications are blocked. Enable them in your browser's site settings, then reload."
  - `blocked` → info toast: "Open the app in a new browser tab to enable notifications (the in-app preview blocks them)." plus a button that opens `window.location.href` in `_blank`.
  - `unsupported` → info toast: "Your browser doesn't support push notifications."
- Hide the prompt only when granted; for denied/blocked also persist dismissal so it doesn't keep nagging.
- Don't render the prompt on `/auth`, `/`, or `/join-organization` routes — wait until the user is signed in and inside the app, so subscription persistence works on the first try.
- Add `disabled` state on the Enable button while the request is in-flight to prevent multi-click confusion.

### 3. (Optional safety) `src/hooks/usePushNotifications.tsx`
- After `Notification.requestPermission` resolves, also call `subscribeToPush` directly (instead of relying solely on the effect) so a successful click immediately registers the subscription even if the component unmounts.

## Files touched
- `src/hooks/usePushNotifications.tsx`
- `src/components/notifications/NotificationPrompt.tsx`

No DB or edge function changes. No new dependencies.
