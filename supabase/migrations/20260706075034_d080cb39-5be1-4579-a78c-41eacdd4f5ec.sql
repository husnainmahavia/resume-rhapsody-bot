
CREATE TABLE IF NOT EXISTS public.email_engine_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  http_status INT,
  source TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.email_engine_health_log TO authenticated;
GRANT ALL ON public.email_engine_health_log TO service_role;
ALTER TABLE public.email_engine_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read health log" ON public.email_engine_health_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert health log" ON public.email_engine_health_log FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS email_engine_health_log_checked_at_idx ON public.email_engine_health_log (checked_at DESC);
