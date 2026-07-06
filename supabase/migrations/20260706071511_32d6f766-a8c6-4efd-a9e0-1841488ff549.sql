
CREATE TABLE IF NOT EXISTS public.services_outreach_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  website TEXT,
  contact_email TEXT,
  phone TEXT,
  location TEXT,
  industry TEXT,
  service_category TEXT NOT NULL,
  website_status TEXT,
  opportunity TEXT,
  price_gbp INTEGER,
  email_subject TEXT,
  email_body TEXT,
  email_generated BOOLEAN NOT NULL DEFAULT false,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  send_error TEXT,
  message_id TEXT,
  batch_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS services_outreach_leads_email_uidx
  ON public.services_outreach_leads (LOWER(contact_email))
  WHERE contact_email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services_outreach_leads TO authenticated;
GRANT ALL ON public.services_outreach_leads TO service_role;
ALTER TABLE public.services_outreach_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage services outreach leads"
  ON public.services_outreach_leads FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_services_outreach_leads_updated
  BEFORE UPDATE ON public.services_outreach_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.services_outreach_state (
  id INT PRIMARY KEY DEFAULT 1,
  running BOOLEAN NOT NULL DEFAULT false,
  status TEXT,
  iteration INT NOT NULL DEFAULT 0,
  discovered INT NOT NULL DEFAULT 0,
  emails_sent INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  last_log TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT services_outreach_state_singleton CHECK (id = 1)
);
INSERT INTO public.services_outreach_state (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services_outreach_state TO authenticated;
GRANT ALL ON public.services_outreach_state TO service_role;
ALTER TABLE public.services_outreach_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read/update outreach state"
  ON public.services_outreach_state FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_services_outreach_state_updated
  BEFORE UPDATE ON public.services_outreach_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
