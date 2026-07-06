
ALTER TABLE public.email_engine_leads
  ADD COLUMN IF NOT EXISTS queued BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.auto_apply_pipeline_state (
  id INT PRIMARY KEY DEFAULT 1,
  running BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_log TEXT,
  location TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auto_apply_pipeline_state_singleton CHECK (id = 1)
);
INSERT INTO public.auto_apply_pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_apply_pipeline_state TO authenticated;
GRANT ALL ON public.auto_apply_pipeline_state TO service_role;
ALTER TABLE public.auto_apply_pipeline_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read auto apply state" ON public.auto_apply_pipeline_state
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service manages auto apply state" ON public.auto_apply_pipeline_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_auto_apply_pipeline_state_updated
  BEFORE UPDATE ON public.auto_apply_pipeline_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
