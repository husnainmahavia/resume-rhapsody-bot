-- Domain blacklist table for bounce tracking
CREATE TABLE public.domain_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  bounce_count integer NOT NULL DEFAULT 1,
  last_bounced_at timestamptz NOT NULL DEFAULT now(),
  blacklisted_at timestamptz,
  is_blacklisted boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.domain_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to domain_blacklist"
ON public.domain_blacklist
FOR ALL
USING (true)
WITH CHECK (true);

-- Email review queue table
CREATE TABLE public.email_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text,
  company text NOT NULL,
  email_subject text,
  email_body text,
  source text NOT NULL DEFAULT 'auto_apply',
  validation_status text NOT NULL DEFAULT 'pending',
  validation_reason text,
  domain_match boolean DEFAULT false,
  approved boolean,
  approved_at timestamptz,
  rejected_reason text,
  application_id uuid,
  scraped_company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to email_review_queue"
ON public.email_review_queue
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_email_review_queue_updated_at
  BEFORE UPDATE ON public.email_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();