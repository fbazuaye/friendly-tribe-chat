# Welcome Token Grant on Organization Join

Give every newly joined user **500 tokens**, deducted from their organization's wallet. If the wallet can't cover it, the user still joins successfully with 0 tokens (no failure).

## Changes

### 1. Database — new RPC `grant_welcome_tokens`
A single `SECURITY DEFINER` function that runs atomically:

- Inputs: `_user_id`, `_org_id`, `_amount` (default 500)
- Verifies caller is `auth.uid() = _user_id` (so users can only grant to themselves on join)
- Locks `organization_wallets` row for the org
- If `total_tokens - tokens_allocated >= _amount`:
  - Upserts `user_token_allocations` (adds 500 to `current_balance`)
  - Increments `organization_wallets.tokens_allocated` by 500
  - Inserts a `token_transactions` row (`transaction_type = 'allocation'`, `action_type = 'welcome_grant'`, with balance_before/after)
  - Returns granted amount
- If insufficient: returns 0, no changes (user still joins)

Idempotency: skip if an allocation row already exists for `(user_id, org_id)` with `current_balance > 0` OR if a prior `welcome_grant` transaction exists for this user+org — prevents double-granting if the user re-runs the join flow.

### 2. Frontend — `src/hooks/useJoinOrganization.tsx`
After the `user_roles` insert succeeds, call `supabase.rpc('grant_welcome_tokens', { _user_id, _org_id, _amount: 500 })`.

- Failure is non-blocking: log and continue to the success toast / redirect
- If returned amount > 0, toast copy becomes: `"Welcome! You've joined {org} with 500 tokens to get started."`
- If 0 (wallet empty), keep current toast — never expose wallet state to the user

### 3. Memory update
Replace `mem://auth/onboarding-token-policy` to reflect: new joiners receive 500 welcome tokens deducted from the org wallet; falls back silently to 0 if wallet is insufficient.

## Technical notes

- No schema column changes — uses existing `organization_wallets`, `user_token_allocations`, `token_transactions` tables.
- `'welcome_grant'` must be added to the `token_action_type` enum (migration `ALTER TYPE ... ADD VALUE`).
- RPC runs in a single transaction with `FOR UPDATE` lock on the wallet row → prevents race conditions across simultaneous joins.
- Does NOT touch existing users — only fires from the join flow.

## Out of scope
- Configurable welcome amount per org (can be added later via a column on `organizations`).
- Retroactive grants to users who already joined with 0 tokens.