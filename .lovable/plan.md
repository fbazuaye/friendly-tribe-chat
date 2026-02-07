

## Fix Africa's Talking API Key

The "supplied authentication is invalid" error is caused by an incorrect API key stored in the secrets.

### Steps
1. Update the `AFRICASTALKING_API_KEY` secret with the correct value from your Africa's Talking dashboard.
2. Send a test SMS to confirm the fix.

### Where to find your API key
- Log in to your Africa's Talking account
- Go to **Settings** then **API Key**
- Copy the full API key string

