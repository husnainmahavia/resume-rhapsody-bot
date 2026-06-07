
-- Lock down all tables to authenticated users only.
-- Edge functions use service_role and bypass RLS, so they continue to work.

DROP POLICY IF EXISTS "Allow all access to sent_emails" ON public.sent_emails;
DROP POLICY IF EXISTS "Allow all access to email_tracking" ON public.email_tracking;
DROP POLICY IF EXISTS "Allow all access to job_applications" ON public.job_applications;
DROP POLICY IF EXISTS "Allow all access to email_engine_leads" ON public.email_engine_leads;
DROP POLICY IF EXISTS "Allow all access to applicant_profile" ON public.applicant_profile;
DROP POLICY IF EXISTS "Allow all access to scraped_companies" ON public.scraped_companies;
DROP POLICY IF EXISTS "Allow all access to linkedin_outreach" ON public.linkedin_outreach;
DROP POLICY IF EXISTS "Allow all access to domain_blacklist" ON public.domain_blacklist;
DROP POLICY IF EXISTS "Allow all access to email_review_queue" ON public.email_review_queue;

REVOKE ALL ON public.sent_emails, public.email_tracking, public.job_applications,
  public.email_engine_leads, public.applicant_profile, public.scraped_companies,
  public.linkedin_outreach, public.domain_blacklist, public.email_review_queue
  FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sent_emails TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_engine_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_profile TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraped_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_outreach TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_blacklist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_review_queue TO authenticated;

CREATE POLICY "Authenticated full access" ON public.sent_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.email_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.job_applications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.email_engine_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.applicant_profile FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.scraped_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.linkedin_outreach FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.domain_blacklist FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.email_review_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
