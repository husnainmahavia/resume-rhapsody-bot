
-- Create table for job applications tracking
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  job_url TEXT,
  job_description TEXT,
  location TEXT,
  salary_range TEXT,
  source TEXT DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'cv_tailored', 'email_sent', 'applied', 'interview', 'rejected', 'offer')),
  tailored_cv TEXT,
  cover_letter TEXT,
  email_subject TEXT,
  email_body TEXT,
  hiring_manager_name TEXT,
  hiring_manager_email TEXT,
  notes TEXT,
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Public access for now (no auth required for personal use)
CREATE POLICY "Allow all access to job_applications" ON public.job_applications FOR ALL USING (true) WITH CHECK (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
