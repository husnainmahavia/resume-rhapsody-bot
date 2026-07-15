CREATE TABLE IF NOT EXISTS public.verified_emails (
  domain TEXT PRIMARY KEY,
  best_email TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  source TEXT NOT NULL,
  all_emails JSONB,
  mx_valid BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT ALL ON public.verified_emails TO service_role;
ALTER TABLE public.verified_emails ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS verified_emails_expires_idx ON public.verified_emails(expires_at);