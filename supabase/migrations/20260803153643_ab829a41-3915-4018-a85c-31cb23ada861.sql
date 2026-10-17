CREATE POLICY "Service role manages upstox tokens"
ON public.upstox_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);