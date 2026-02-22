

# Fix Home Screen Icon Badge (VAPID Key Mismatch)

## The Problem

The home screen icon badge only updates while the app is open. When the app is closed, it should be updated via push notifications, but **all push notifications are failing** with a 403 error:

> "the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions"

This means the VAPID keys on the server no longer match the keys used when users originally subscribed. All existing push subscriptions in the database are invalid.

## The Fix

### Step 1: Generate new VAPID keys and update secrets

- Generate a fresh pair of VAPID keys
- Update the backend secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) with the new values
- Update the public key in `src/hooks/usePushNotifications.tsx`

### Step 2: Clear all stale push subscriptions

- Run a database migration to truncate the `push_subscriptions` table, since every existing subscription was created with the old (mismatched) key and will never work

### Step 3: Force users to re-subscribe on next visit

- Update `usePushNotifications.tsx` to always check if the current subscription's `applicationServerKey` matches the new VAPID key
- If it doesn't match, unsubscribe the old one and create a new subscription with the correct key
- This ensures users automatically get a fresh, working subscription on their next app visit

### Step 4: Update service worker push handler to also set badge

- In `public/sw.js`, update the `push` event handler to call `self.registration.setAppBadge()` (if available) when a push notification arrives, so the home screen badge updates even when the app is closed

## What This Solves

- Push notifications will start working again (no more 403 errors)
- Home screen icon badge will update in real-time, even when the app is closed
- Existing users will automatically re-subscribe on their next visit -- no action needed from them

## Technical Details

- **`src/hooks/usePushNotifications.tsx`**: Replace hardcoded VAPID public key with new one; add logic to detect stale subscriptions (wrong applicationServerKey) and re-subscribe
- **`public/sw.js`**: Add `self.registration.setAppBadge()` call inside the `push` event listener
- **Database migration**: `TRUNCATE TABLE public.push_subscriptions;` to clear all invalid subscriptions
- **Backend secrets**: Update `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` -- you will be prompted to enter the new values

