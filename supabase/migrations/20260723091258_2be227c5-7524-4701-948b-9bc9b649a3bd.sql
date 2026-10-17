
CREATE TABLE public.news_sent (
  guid TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  title TEXT,
  link TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.news_sent TO authenticated;
GRANT ALL ON public.news_sent TO service_role;
ALTER TABLE public.news_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.news_sent FOR ALL USING (false);
CREATE INDEX idx_news_sent_symbol_time ON public.news_sent (symbol, sent_at DESC);
