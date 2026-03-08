
-- Email tracking table for open rates and response tracking
CREATE TABLE public.email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE NOT NULL,
  tracking_pixel_id UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE,
  open_count INTEGER DEFAULT 0,
  replied_at TIMESTAMP WITH TIME ZONE,
  reply_snippet TEXT,
  bounced BOOLEAN DEFAULT false,
  bounce_reason TEXT,
  follow_up_sent_at TIMESTAMP WITH TIME ZONE,
  follow_up_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.email_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to email_tracking" ON public.email_tracking FOR ALL USING (true) WITH CHECK (true);

-- Add sponsorship and follow-up columns to job_applications
ALTER TABLE public.job_applications 
  ADD COLUMN IF NOT EXISTS sponsorship_available BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_scheduled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS follow_up_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_posted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS careers_page_url TEXT;

-- Enable realtime for email_tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_tracking;
