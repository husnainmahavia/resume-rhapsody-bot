
CREATE TABLE IF NOT EXISTS public.bulk_send_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  running BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  current_company TEXT,
  step TEXT,
  last_error TEXT,
  queue_ids UUID[] NOT NULL DEFAULT '{}',
  CONSTRAINT bulk_send_state_singleton CHECK (id = 1)
);

GRANT SELECT ON public.bulk_send_state TO authenticated;
GRANT ALL ON public.bulk_send_state TO service_role;

ALTER TABLE public.bulk_send_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read bulk send state"
  ON public.bulk_send_state FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.bulk_send_state (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
