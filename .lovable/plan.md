

## Fix: Bulk SMS Page Not Displaying

### Problem
When navigating to `/admin/sms`, the page appears blank. This happens because:

1. The `RequireOrganization` wrapper returns `null` (blank screen) while checking auth state, and during the redirect to `/auth`
2. The `BulkSMS` page has its own separate auth/role loading check that duplicates the wrapper's work
3. If the user IS authenticated but the role check is slow, the page shows only a spinner with no context

### Solution

**1. Remove redundant auth checking from BulkSMS.tsx**
- The `RequireOrganization` wrapper already handles redirecting unauthenticated users
- Remove the duplicate `useAuth` loading check from `BulkSMS`
- Keep only the `useUserRole` admin check for authorization

**2. Add a visible loading state to RequireOrganization**
- Instead of returning `null` while redirecting, show a branded loading screen with a message like "Redirecting to login..."
- This prevents the blank page flash

**3. Improve the BulkSMS loading/access denied states**
- Show the page header even while the role is loading, so users see something immediately
- Keep the admin-only gate but with better visual feedback

### Technical Changes

| File | Change |
|------|--------|
| `src/components/auth/RequireOrganization.tsx` | Show loading UI instead of `null` when redirecting unauthenticated users |
| `src/pages/BulkSMS.tsx` | Remove duplicate `useAuth` loading check; rely on `RequireOrganization` for auth; keep `useUserRole` for admin gating |

