-- 1. Widen job_type CHECK to include expander types
ALTER TABLE public.delivery_jobs DROP CONSTRAINT IF EXISTS delivery_jobs_job_type_check;
ALTER TABLE public.delivery_jobs
  ADD CONSTRAINT delivery_jobs_job_type_check
  CHECK (job_type = ANY (ARRAY['push'::text, 'sms'::text, 'enqueue_broadcast'::text, 'enqueue_sms'::text]));

-- 2. Heal stuck broadcast_messages that never got any delivery_jobs queued
UPDATE public.broadcast_messages bm
SET delivery_completed_at = now(),
    delivery_legacy = true
WHERE bm.delivery_completed_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.delivery_jobs dj WHERE dj.parent_id = bm.id
  );
