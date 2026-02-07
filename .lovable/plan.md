

## Fix: Africa's Talking Sandbox API URL

### Problem
The `send-bulk-sms` edge function is calling the **production** Africa's Talking endpoint (`api.africastalking.com`) while using the **Sandbox** username. The production endpoint rejects the sandbox API key with a plain-text error like "The supplied API key is invalid", which the function then fails to parse as JSON -- causing the 500 error.

### Solution
Change the API URL to the sandbox endpoint and add safer response parsing.

### Changes

**File: `supabase/functions/send-bulk-sms/index.ts`**

1. Change the API URL from `https://api.africastalking.com/version1/messaging` to `https://api.sandbox.africastalking.com/version1/messaging` (line 113)
2. Add safe response parsing: read the response as text first, then try to parse as JSON. If parsing fails, use the raw text in the error message. This prevents crashes if the API returns non-JSON errors.

```
// Before parsing:
const responseText = await atResponse.text();
let atResult;
try {
  atResult = JSON.parse(responseText);
} catch {
  console.error("Non-JSON response from AT:", responseText);
  throw new Error(`Africa's Talking returned non-JSON: ${responseText}`);
}
```

