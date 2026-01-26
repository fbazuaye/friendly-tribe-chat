
# Fix: New User Not Redirected to Join Organization Page

## Problem Summary
New users who sign in without an organization are not being automatically redirected to `/join-organization`. This affects the onboarding flow where users must enter an invite code to join an organization.

## Root Cause
The redirect logic in `Auth.tsx` has a bug where it doesn't properly distinguish between:
- `hasOrganization === null` (still loading/unknown state)
- `hasOrganization === false` (confirmed user has no organization)

Current code treats `null` as falsy, which can cause premature or missed redirects due to timing issues with the auth state listener.

## Solution Overview

### 1. Fix Auth.tsx Redirect Logic
Update the `useEffect` to explicitly check for `hasOrganization === false` instead of relying on falsy evaluation:

```typescript
useEffect(() => {
  if (!authLoading && !orgLoading && user) {
    if (hasOrganization === true) {
      navigate("/chats");
    } else if (hasOrganization === false) {
      navigate("/join-organization");
    }
    // When hasOrganization is null, do nothing (still determining)
  }
}, [user, authLoading, orgLoading, hasOrganization, navigate]);
```

### 2. Improve useOrganizationCheck Hook
Add a re-fetch mechanism when the user changes to ensure the organization status is always current:

- Add the user ID to the dependency array for the profile query
- Ensure the loading state properly resets when user changes
- Add a refetch function that can be called after profile updates

### 3. Fix Sign-In Flow in Auth.tsx
After a successful sign-in, the navigation should wait for the organization check to complete rather than relying solely on the `useEffect`:

- Remove the comment "Navigation will be handled by useEffect based on org status"
- Ensure the `useOrganizationCheck` hook re-evaluates after sign-in

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Auth.tsx` | Fix redirect logic to use explicit boolean checks |
| `src/hooks/useOrganizationCheck.tsx` | Add refetch capability and improve loading state management |

## Technical Details

### Auth.tsx Changes
```typescript
// Before (buggy)
if (hasOrganization) {
  navigate("/chats");
} else {
  navigate("/join-organization");
}

// After (fixed)
if (hasOrganization === true) {
  navigate("/chats");
} else if (hasOrganization === false) {
  navigate("/join-organization");
}
```

### useOrganizationCheck.tsx Changes
- Reset `hasOrganization` to `null` and `loading` to `true` when user changes
- This ensures a fresh check is performed for each authentication event
- Add `refetch` function to the returned object for manual re-checks if needed

## Expected Behavior After Fix
1. New user signs up or signs in
2. `useOrganizationCheck` queries their profile
3. If `organization_id` is null, `hasOrganization` is set to `false`
4. The `useEffect` in Auth.tsx detects `hasOrganization === false`
5. User is redirected to `/join-organization`
6. User enters invite code and joins organization
7. User is redirected to `/chats`

## Testing Checklist
- New user signup redirects to `/join-organization`
- Existing user without organization signing in redirects to `/join-organization`
- Existing user with organization signing in redirects to `/chats`
- After joining organization, user is redirected to `/chats`
