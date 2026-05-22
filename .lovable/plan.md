## Problem

The "Upload File" button silently fails for many real-world contact files because `processRows` requires the first row to be a header containing the word `phone`, `mobile`, `tel`, or `number`. If the file is just a list of phone numbers, or uses headers like `Msisdn`, `Cell`, `Contact`, or `A`, the import aborts with "File must have a column with 'phone'…" — and many users don't see that toast.

It also drops the first row of headerless files when detection accidentally matches, and gives no diagnostic when nothing imports.

## Fix (frontend only, in `src/components/sms/SMSContactManager.tsx`)

1. **Auto-detect headerless files.** Before treating row 1 as headers, run `normalizePhoneE164` on its first non-empty cell. If it parses as a valid phone, treat the whole file as headerless: phone = column 0, name = column 1 (if present), email = column with `@` (if present).

2. **Broaden header matching.** Add `msisdn`, `cell`, `contact`, `whatsapp`, `gsm`, `no.`, `#` to the phone-column detector. If still nothing matches but the file has only one column, assume that column is the phone.

3. **Last-resort fallback.** If header detection fails and row 1's first cell is not a phone either, still attempt column 0 as phone and report how many rows were valid vs skipped, instead of aborting with an error.

4. **Better diagnostics.** Log a console summary (`total rows`, `valid`, `skipped`, sample skipped value) and show a toast like `"Imported 42, skipped 3 invalid numbers"` so the user always knows the file was read.

5. **Trim BOM** from the first CSV cell (`\uFEFF`) which currently breaks header detection for Excel-exported CSVs.

6. **Reset the file input** before opening the picker so re-uploading the same file works (already handled in `finally`, but also clear before click).

## Out of scope

- No backend changes, no DB migration, no new dependencies.
- No UI restyle — same buttons and layout.
- No change to phone normalization rules in `src/lib/phone.ts`.

## Files touched

- `src/components/sms/SMSContactManager.tsx` — update `processRows` and `handleFileUpload` only.
