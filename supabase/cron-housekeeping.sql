-- ============================================================
-- pg_cron schedule for the housekeeping Edge Function.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the housekeeping function every 5 minutes.
-- Replace <PROJECT_REF> with your Supabase project ref.
-- Replace <ANON_KEY> with your Supabase anon key.
SELECT cron.schedule(
  '400faqs-housekeeping',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/housekeeping',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <ANON_KEY>',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Optional: hourly retention pass (same function, just runs more often)
-- SELECT cron.schedule(
--   '400faqs-retention',
--   '0 * * * *',
--   $$
--     SELECT net.http_post(
--       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/housekeeping',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer <ANON_KEY>',
--         'Content-Type', 'application/json'
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );

-- To unschedule:
-- SELECT cron.unschedule('400faqs-housekeeping');
