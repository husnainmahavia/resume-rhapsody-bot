
CREATE TABLE public.linkedin_outreach (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  job_url TEXT,
  job_description TEXT,
  location TEXT,
  salary_range TEXT,
  hiring_manager_name TEXT,
  hiring_manager_linkedin TEXT,
  connection_message TEXT,
  inmail_message TEXT,
  post_comment TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  message_sent BOOLEAN DEFAULT false,
  message_sent_at TIMESTAMPTZ,
  response_received BOOLEAN DEFAULT false,
  response_snippet TEXT,
  source TEXT DEFAULT 'linkedin_search',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.linkedin_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to linkedin_outreach" ON public.linkedin_outreach FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_linkedin_outreach_updated_at
  BEFORE UPDATE ON public.linkedin_outreach
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
