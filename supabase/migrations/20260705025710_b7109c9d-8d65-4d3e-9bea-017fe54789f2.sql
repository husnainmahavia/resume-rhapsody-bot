DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['applicant_profile','domain_blacklist','email_engine_leads','email_review_queue','email_tracking','job_applications','linkedin_outreach','scraped_companies','sent_emails']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public testing access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Public testing access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;