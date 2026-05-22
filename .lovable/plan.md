## Goal

Normalize all phone numbers to E.164 (Nigeria-default `+234`) at every entry point so the contact database is clean and SMS delivery is reliable.

## Current state

- The edge function `deliver-batch` already has a `normalizeE164` that converts `0XXXXXXXXXX` → `+234XXXXXXXXXX`. That fixes outbound calls but leaves raw/dirty numbers stored in `sms_contacts`.
- Frontend entry points store whatever the user types:
  - `SMSContactManager` — manual add, paste (`phone;name;email`), CSV upload
  - `SMSComposer` — manual textarea recipients

## Plan

### 1. New shared util `src/lib/phone.ts`
Export `normalizePhoneE164(raw, defaultCountry='NG')`:
- Strip spaces, dashes, parens, dots.
- `00…` → `+…`.
- If starts with `0` and remaining 10 digits → prepend `+234` (NG default).
- If digits-only 10 (e.g. `8031234567`) and NG default → prepend `+234`.
- If already starts with `234` → prepend `+`.
- Validate `^\+\d{8,15}$`; return `null` if invalid.

### 2. `SMSContactManager.tsx`
- Manual add: normalize `newPhone`; reject with toast if invalid.
- Paste import: normalize each line's phone; skip + count invalids; surface count in toast.
- CSV import: normalize `phone` per row; skip invalids; surface count in toast.

### 3. `SMSComposer.tsx`
- After splitting textarea into recipients, normalize each; drop invalids and toast a summary ("X numbers skipped as invalid").
- Show normalized preview count.

### 4. Backend (no schema change)
- `deliver-batch` keeps its existing `normalizeE164` as a safety net (handles any legacy rows).

### Out of scope
- No DB migration, no backfill of existing rows, no token/cost/UI restyle.

## Files touched
- new `src/lib/phone.ts`
- `src/components/sms/SMSContactManager.tsx`
- `src/components/sms/SMSComposer.tsx`
