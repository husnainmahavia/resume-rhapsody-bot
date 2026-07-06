CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'services-outreach-autopilot') THEN
    PERFORM cron.unschedule('services-outreach-autopilot');
  END IF;
END $$;

SELECT cron.schedule(
  'services-outreach-autopilot',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://icpthxksstcojunjqmrp.supabase.co/functions/v1/services-outreach-pipeline',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhYmFzZSIsInJlZiI6ImljcHRoeGtzc3Rjb2p1bmpxbXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mjc2NzYsImV4cCI6MjA4ODUwMzY3Nn0.SQNc-bxV5bRPG3sgZkMfwOCds5zgnQd5oCcIZ0TFiyg","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhYmFzZSIsInJlZiI6ImljcHRoeGtzc3Rjb2p1bmpxbXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mjc2NzYsImV4cCI6MjA4ODUwMzY3Nn0.SQNc-bxV5bRPG3sgZkMfwOCds5zgnQd5oCcIZ0TFiyg"}'::jsonb,
    body := '{"action":"run","region":"United Kingdom"}'::jsonb
  ) AS request_id;
  $$
);

DROP POLICY IF EXISTS "Anyone can insert health log" ON public.email_engine_health_log;
DROP POLICY IF EXISTS "Anyone can read health log" ON public.email_engine_health_log;

REVOKE ALL ON public.email_engine_health_log FROM anon;
REVOKE INSERT ON public.email_engine_health_log FROM authenticated;
GRANT SELECT ON public.email_engine_health_log TO authenticated;
GRANT ALL ON public.email_engine_health_log TO service_role;

CREATE POLICY "Authenticated can read email engine health log"
  ON public.email_engine_health_log
  FOR SELECT
  TO authenticated
  USING (true);