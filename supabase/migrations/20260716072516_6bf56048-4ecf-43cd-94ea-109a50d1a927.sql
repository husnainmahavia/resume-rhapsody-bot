
CREATE TABLE IF NOT EXISTS public.osm_raw_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  osm_id TEXT NOT NULL,
  category TEXT NOT NULL,
  area TEXT NOT NULL,
  business_name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (osm_id, category)
);
CREATE INDEX IF NOT EXISTS idx_osm_raw_leads_unprocessed ON public.osm_raw_leads (processed, category, area);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.osm_raw_leads TO authenticated;
GRANT ALL ON public.osm_raw_leads TO service_role;
ALTER TABLE public.osm_raw_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read osm_raw_leads" ON public.osm_raw_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write osm_raw_leads" ON public.osm_raw_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS public.sender_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox TEXT NOT NULL UNIQUE,
  daily_cap INTEGER NOT NULL DEFAULT 5,
  ramp_step INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_config TO authenticated;
GRANT ALL ON public.sender_config TO service_role;
ALTER TABLE public.sender_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sender_config" ON public.sender_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sender_config" ON public.sender_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_sender_config_updated_at
BEFORE UPDATE ON public.sender_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sender_config (mailbox, daily_cap, ramp_step, notes)
VALUES ('info@visuosofts.com', 5, 1, 'Warm-up: 5 → 10 → 20 → 40 over 2 weeks')
ON CONFLICT (mailbox) DO NOTHING;


ALTER TABLE public.services_outreach_leads
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS website_score INTEGER,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
