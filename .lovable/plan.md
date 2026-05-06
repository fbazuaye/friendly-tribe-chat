## Problem

After scaling `broadcast_messages.total_recipients` to `bigint` (for 1M-member channels), the read-side RPCs were not updated. They still declare `total_recipients integer` in their `RETURNS TABLE(...)`, so Postgres aborts every call with:

```
ERROR: structure of query does not match function result type
```

This breaks:
- The Broadcast Delivery Receipts sheet (`get_broadcast_message_stats`)
- The channel CSV / PDF download menu (`get_channel_broadcast_report`)

## Fix

One small migration that recreates the two functions with `total_recipients bigint`. No client changes needed — `BroadcastReceipts.tsx` and `broadcastExport.ts` already treat the field as a number.

```sql
-- 1. Stats RPC
CREATE OR REPLACE FUNCTION public.get_broadcast_message_stats(_message_id uuid)
RETURNS TABLE(
  message_id uuid,
  total_recipients bigint,        -- was integer
  push_sent_count integer,
  push_failed_count integer,
  read_count bigint,
  delivery_completed_at timestamptz,
  delivery_legacy boolean
) ...  -- body unchanged

-- 2. Channel report RPC
CREATE OR REPLACE FUNCTION public.get_channel_broadcast_report(_channel_id uuid, _since timestamptz)
RETURNS TABLE(
  message_id uuid,
  content text,
  created_at timestamptz,
  total_recipients bigint,        -- was integer
  push_sent_count integer,
  push_failed_count integer,
  read_count bigint,
  delivery_completed_at timestamptz,
  delivery_legacy boolean
) ...  -- body unchanged
```

Postgres requires `DROP FUNCTION` before changing a `RETURNS TABLE` signature, so the migration will `DROP ... IF EXISTS` first, then `CREATE` with the same body as today.

## Verification

- Open a broadcast → tap the receipt strip → sheet renders with delivered/failed/reads.
- Open the channel export menu → CSV and PDF download for "Last 7 days / 30 days / All time".
- No new "structure of query" errors in Postgres logs.