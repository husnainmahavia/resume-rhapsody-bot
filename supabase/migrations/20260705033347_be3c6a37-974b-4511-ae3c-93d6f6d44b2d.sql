ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS cv_profile text;
CREATE INDEX IF NOT EXISTS job_applications_cv_profile_idx ON public.job_applications (cv_profile);