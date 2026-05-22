## Context

Upgrading Twilio (per the advice you got) removes the verified-caller-ID restriction — that's the right move and unblocks sending to any Nigerian number. But it doesn't fix the app-side bug: your manual Twilio test delivered because it used **From `+14029617537`**, while our `deliver-batch` edge function sends with **`MessagingServiceSid`**. On a Messaging Service with no sender/sender-pool attached, Twilio accepts the request (`delivery_jobs` shows `succeeded`) and silently drops it. That's why blasts show "queued" forever in the app even though Twilio reported no error.

## Plan

### 1. `deliver-batch` — sender selection
Update the Twilio POST in `supabase/functions/deliver-batch/index.ts` to pick a sender in this order:
1. If `TWILIO_FROM_NUMBER` secret is set → send with `From=<that number>` (works today on your trial/upgraded number)
2. Else if `TWILIO_MESSAGING_SERVICE_SID` is set → send with `MessagingServiceSid=<sid>` (for later, once you attach a sender pool or register an Alphanumeric Sender ID for Nigeria)
3. Else fail the job with a clear "no Twilio sender configured" error

This means we can ship today on `+14029617537`, and switch to a Messaging Service later by just unsetting the From secret — no code change.

### 2. Capture Twilio response per recipient
Right now we throw away the response body on success. Parse Twilio's JSON response and store `sid`, `status`, and any `error_code` / `error_message` into `sms_logs.response_data`, plus the first error string into `delivery_jobs.last_error`, so the History tab actually tells you why a number failed (e.g. `[21408] Permission to send an SMS has not been enabled for the region`, `[21610] opted out`).

### 3. Roll status up from `delivery_jobs` to `sms_logs`
Today `sms_logs.status` is stuck on `queued` even after Twilio accepts the messages. Migration:
- Add `sent_count INT DEFAULT 0` and `failed_count INT DEFAULT 0` columns to `sms_logs`
- Extend the existing `complete_delivery_job` RPC: for `job_type='sms'`, fan per-job success/failure counts up to the parent `sms_logs` row, and once no `pending`/`claimed` children remain, flip `sms_logs.status` to `sent` (all good), `partial` (some failed), or `failed` (all failed)

### 4. Add the `TWILIO_FROM_NUMBER` secret
I'll request it via the secret tool — value: `+14029617537` (the number Twilio successfully delivered from in your test). You can change it later to any other Twilio number you own.

## What you still need to do in Twilio

- **Upgrade the account** (the advice you posted) — this is the actual unblocker for non-verified Nigerian recipients.
- **Save the geo permissions** with Nigeria enabled (the page in your earlier screenshot was unsaved).
- *(Optional, later)* Register an **Alphanumeric Sender ID** for Nigeria — Nigerian carriers heavily filter US long codes at volume, so deliverability from `+1402…` will degrade as you scale. Once registered, attach it to a Messaging Service and unset `TWILIO_FROM_NUMBER` to switch over.

## Out of scope (happy to plan as follow-up)

- True per-recipient delivery receipts (`delivered` / `undelivered` / carrier `failed`) — needs a Twilio status-callback webhook + new `sms_recipients` table.
- Alphanumeric Sender ID registration workflow.
