
# Plan: Organization Onboarding for New Users

## Problem
New users who sign up have `organization_id = NULL` in their profile, which means:
- They cannot see other users in the chat
- Other users cannot see them
- They cannot access any organization features (chats, broadcasts, etc.)

Currently, there is only **one organization** ("LiveGig Organization") and no way for new users to join it.

## Solution: Invite Code System

Implement an invite code system where:
1. Organizations have unique invite codes
2. New users enter an invite code after signing up to join an organization
3. The system automatically creates their profile, role, and token allocation

## Implementation

### 1. Database Changes

**Add invite code to organizations table:**
```sql
ALTER TABLE organizations 
ADD COLUMN invite_code TEXT UNIQUE;

-- Generate a code for the existing organization
UPDATE organizations 
SET invite_code = 'LIVEGIG2026' 
WHERE id = '11111111-1111-1111-1111-111111111111';
```

**Add RLS policy for reading organizations by invite code:**
```sql
CREATE POLICY "Anyone can lookup org by invite code"
  ON public.organizations FOR SELECT
  USING (true);  -- Allow reading to find org by invite code
```

### 2. Create Onboarding Page

**New file: `src/pages/JoinOrganization.tsx`**

A page shown to users without an organization:
- Friendly welcome message
- Input field for invite code
- "Join" button
- Error handling for invalid codes

### 3. Modify Auth Flow

**Edit: `src/hooks/useAuth.tsx`**

After sign-in, check if user has an organization:
- If yes → proceed to /chats
- If no → redirect to /join-organization

**Edit: `src/pages/Auth.tsx`**

Update the redirect logic to check organization status.

### 4. Create Join Organization Logic

**New hook or service in `src/hooks/useJoinOrganization.tsx`**

When a user enters a valid invite code:
1. Look up organization by invite code
2. Update profile with organization_id
3. Create user_role entry (default: 'user')
4. Create user_token_allocation entry (default quota: 100 tokens)
5. Redirect to /chats

### 5. Update App Routes

**Edit: `src/App.tsx`**

Add route for the join page:
```tsx
<Route path="/join-organization" element={<JoinOrganization />} />
```

### 6. Add Protected Route Logic

Create a wrapper that checks organization membership before allowing access to main app routes.

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `src/pages/JoinOrganization.tsx` | Invite code entry page |
| `src/hooks/useJoinOrganization.tsx` | Join organization logic |

### Files to Modify
| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/join-organization` route, add organization check |
| `src/hooks/useAuth.tsx` | Check organization status on auth state change |

### Database Changes
| Change | Purpose |
|--------|---------|
| Add `invite_code` column to organizations | Store unique invite codes |
| Set invite code for existing org | Allow users to join "LiveGig Organization" |
| Add RLS policy for org lookup | Allow unauthenticated users to find org by code |

### User Flow

```text
New User Signs Up → No organization_id 
    → Redirected to /join-organization
    → Enters invite code "LIVEGIG2026"
    → System creates:
        - Profile updated with organization_id
        - user_roles entry (role: 'user')
        - user_token_allocations entry (100 tokens)
    → Redirected to /chats
    → Can now see and chat with other org members
```

### Security Considerations
- Invite codes should be unique and hard to guess
- Only authenticated users can use invite codes
- Users can only join one organization at a time
- Super admins can regenerate invite codes later (future enhancement)

### Your Existing Invite Code
Once implemented, share this code with new users:
**LIVEGIG2026**

---

## Quick Fix Alternative

If you just want to add the new user (`talabigabriel3@gmail.com`) to your organization immediately without the full onboarding system, I can run a database update instead. Let me know which approach you prefer.
