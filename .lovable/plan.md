## Goal

Swap the bulk SMS pipeline from Africa's Talking to **Twilio**, using a **Twilio Messaging Service** as the sender (best for high-volume political-campaign-style blasts). SMS only — WhatsApp can be added later.

No UI changes for admins: the Bulk SMS composer, contacts, logs, and token costs all stay the same. Only the delivery backend changes.

## Setup (you do these once)

1. In Twilio Console → **Messaging → Services**, create a Messaging Service:
   - Use case: *Notify my users* (or *Marketing* for campaigns)
   - Add one or more sender numbers / a number pool to it
   - Copy the **Messaging Service SID** (starts with `MG...`)
2. (Optional but recommended) Enable **SMS Pumping Protection** and tighten **SMS Geo Permissions** to just the countries you send to (e.g. Nigeria) to prevent fraud.
3. Connect Twilio via Lovable's Twilio connector — this stores your Account SID and API key securely; no manual secret entry needed. I'll also ask you to add one runtime secret: `TWILIO_MESSAGING_SERVICE_SID` (the `MG...` value from step 1).

## What I'll build

### Backend
- **Connect Twilio connector** to the project (gives edge functions `TWILIO_API_KEY` via the secure gateway — no Account SID/auth-token handling in code).
- **Add `TWILIO_MESSAGING_SERVICE_SID` secret** so we can route through your Messaging Service.
- **Rewrite `supabase/functions/send-bulk-sms/index.ts`** to call Twilio's `/Messages.json` via the connector gateway, sending `MessagingServiceSid` + `To` + `Body` per recipient. Keep the existing auth check, admin gate, token deduction, phone normalization (E.164), `sms_logs` writes, and response shape so the UI and token accounting work unchanged.
- **Update `supabase/functions/deliver-batch/index.ts`** (the queue worker used for very large blasts) the same way — swap the AT call for Twilio, keep the per-recipient success/failure counting and retry/backoff logic intact.
- **Phone normalization**: ensure numbers go out as E.164 (e.g. `+234...`). Reject obviously invalid numbers before the API call so we don't burn tokens or hit Twilio errors.
- **Error handling**: map Twilio error codes (e.g. `21610` opted-out, `21614` invalid number, `30007` filtered) into `sms_logs.response_data` so admins can see why a delivery failed.

### Cleanup
- Remove `AFRICASTALKING_API_KEY` and `AFRICASTALKING_USERNAME` from edge function code (the secrets can stay in the project for a bit in case you want to roll back; I can delete them on your say-so).
- Update the `mem://tech/sms-delivery-infrastructure` and `mem://tech/sms-credential-constraints` memory files to reflect Twilio.
- Update `mem://features/bulk-sms-implementation` to mention Twilio Messaging Service.

### Not changed
- Bulk SMS admin UI, contact lists, CSV import, history view.
- Token costs per SMS, admin-only gating, RLS policies.
- `sms_logs` and `sms_contacts` table shapes.
- The `delivery_jobs` queue plumbing (only the worker's HTTP call changes).

## Technical details (for reference)

Edge function call shape (per recipient or batched):
```
POST https://connector-gateway.lovable.dev/twilio/Messages.json
Headers:
  Authorization: Bearer ${LOVABLE_API_KEY}
  X-Connection-Api-Key: ${TWILIO_API_KEY}
  Content-Type: application/x-www-form-urlencoded
Body:
  MessagingServiceSid=${TWILIO_MESSAGING_SERVICE_SID}
  To=+234...
  Body=<message>
```

Twilio's API requires one HTTP call per recipient (no native bulk endpoint), but the Messaging Service handles throughput scaling, sender selection, and queueing automatically. For very large blasts the existing `deliver-batch` worker already chunks recipients and runs in parallel, which fits Twilio's per-second limits.

## Open question before I build

**Country coverage**: should I restrict outbound SMS to Nigeria only at the edge-function level (cheapest, safest), or allow any country your Messaging Service is permitted to send to? Default recommendation: Nigeria-only until you explicitly expand.
