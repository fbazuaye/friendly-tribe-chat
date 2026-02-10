

# Add Google Authentication

## Overview
Add a "Sign in with Google" button to the Auth page using Lovable Cloud's managed Google OAuth. This gives users a one-tap sign-in option alongside the existing email/password flow.

## What will change

1. **Configure Google OAuth** -- Use the built-in Cloud authentication tool to enable Google sign-in and generate the required `lovable` integration module.

2. **Update the Auth page** -- Replace the disabled "Coming soon" Google button with a working one that calls `lovable.auth.signInWithOAuth("google", ...)`. The Apple button will remain disabled for now.

3. **Update the divider text** -- Change "Coming soon" to "Or continue with" since Google will now be active.

4. **Handle post-login redirect** -- The existing `useEffect` in `Auth.tsx` already handles redirecting based on organization membership, so Google-authenticated users will flow through the same join-organization check automatically.

5. **Profile creation** -- The existing `onAuthStateChange` listener in `useAuth.tsx` already creates a profile on `SIGNED_IN`, so Google users will get a profile automatically using their email prefix as display name.

## Technical Details

- The `supabase--configure-social-auth` tool will generate files in `src/integrations/lovable/` and install `@lovable.dev/cloud-auth-js`.
- The Auth page will import `lovable` from `@/integrations/lovable/index` and call `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`.
- No database migrations needed -- existing `profiles` table and `user_roles` flow handle new users regardless of auth method.
- No PWA service worker config needed since the project doesn't use `vite-plugin-pwa` (it uses a manual `sw.js`).

