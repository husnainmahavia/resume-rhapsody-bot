DROP POLICY IF EXISTS "scraper_state readable" ON public.scraper_state;
CREATE POLICY "scraper_state readable by authenticated" ON public.scraper_state FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.scraper_state FROM anon;