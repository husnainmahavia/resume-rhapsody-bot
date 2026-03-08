CREATE TABLE public.email_engine_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  website text,
  contact_email text,
  industry text NOT NULL DEFAULT 'general',
  region text NOT NULL DEFAULT 'United Kingdom',
  description text,
  opportunity text,
  email_subject text,
  email_body text,
  email_generated boolean NOT NULL DEFAULT false,
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  resend_message_id text,
  send_error text,
  opened boolean NOT NULL DEFAULT false,
  clicked boolean NOT NULL DEFAULT false,
  bounced boolean NOT NULL DEFAULT false,
  campaign_batch text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_engine_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to email_engine_leads" ON public.email_engine_leads FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_email_engine_leads_updated_at
  BEFORE UPDATE ON public.email_engine_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_email_engine_leads_industry ON public.email_engine_leads(industry);
CREATE INDEX idx_email_engine_leads_sent ON public.email_engine_leads(sent);
CREATE INDEX idx_email_engine_leads_campaign ON public.email_engine_leads(campaign_batch);