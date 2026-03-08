
CREATE TABLE public.scraped_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  source TEXT DEFAULT 'google',
  location TEXT,
  description TEXT,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  email_opened BOOLEAN DEFAULT false,
  email_replied BOOLEAN DEFAULT false,
  reply_snippet TEXT,
  status TEXT DEFAULT 'scraped',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, category)
);

ALTER TABLE public.scraped_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to scraped_companies" ON public.scraped_companies FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_scraped_companies_updated_at
  BEFORE UPDATE ON public.scraped_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
