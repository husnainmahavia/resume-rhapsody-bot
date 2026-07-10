CREATE TABLE IF NOT EXISTS public.scraper_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  running BOOLEAN NOT NULL DEFAULT false,
  action TEXT,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  current_item TEXT,
  step TEXT,
  last_error TEXT,
  queue JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT scraper_state_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_state TO authenticated;
GRANT ALL ON public.scraper_state TO service_role;
GRANT SELECT ON public.scraper_state TO anon;

ALTER TABLE public.scraper_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraper_state readable"
  ON public.scraper_state FOR SELECT
  USING (true);

CREATE POLICY "scraper_state writable by authenticated"
  ON public.scraper_state FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO public.scraper_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
