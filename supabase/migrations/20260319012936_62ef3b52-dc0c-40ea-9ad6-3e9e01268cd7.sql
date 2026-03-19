-- Sent emails ledger for deduplication
CREATE TABLE public.sent_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  sender text NOT NULL DEFAULT 'gmail',
  subject text,
  application_id uuid,
  lead_id uuid,
  message_id text,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one email per recipient+sender combo
CREATE UNIQUE INDEX idx_sent_emails_recipient_sender ON public.sent_emails (lower(recipient_email), sender);

-- Index for fast lookups
CREATE INDEX idx_sent_emails_recipient ON public.sent_emails (lower(recipient_email));

-- RLS
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to sent_emails" ON public.sent_emails FOR ALL TO public USING (true) WITH CHECK (true);