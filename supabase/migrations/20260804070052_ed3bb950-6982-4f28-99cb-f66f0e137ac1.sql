CREATE TABLE public.ai_trade_sent (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_key text NOT NULL,
  sent_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_key, sent_date)
);
GRANT ALL ON public.ai_trade_sent TO service_role;
ALTER TABLE public.ai_trade_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages ai trade dedupe" ON public.ai_trade_sent FOR ALL TO service_role USING (true) WITH CHECK (true);