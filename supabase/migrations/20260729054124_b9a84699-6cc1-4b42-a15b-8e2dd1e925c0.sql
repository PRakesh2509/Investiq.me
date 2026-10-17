REVOKE ALL ON public.ipo_sent FROM anon, authenticated;
GRANT ALL ON public.ipo_sent TO service_role;
CREATE POLICY "Service role manages ipo_sent" ON public.ipo_sent FOR ALL TO service_role USING (true) WITH CHECK (true);