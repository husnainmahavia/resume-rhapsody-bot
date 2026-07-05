
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS match_score integer,
  ADD COLUMN IF NOT EXISTS match_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS ats_missing text[],
  ADD COLUMN IF NOT EXISTS ats_present text[],
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

CREATE INDEX IF NOT EXISTS job_applications_pending_review_idx
  ON public.job_applications (pending_review, created_at DESC);
