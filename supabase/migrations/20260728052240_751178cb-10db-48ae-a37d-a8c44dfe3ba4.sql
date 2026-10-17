
-- 1) Dedup table for IPO alerts
CREATE TABLE IF NOT EXISTS public.ipo_sent (
  ipo_id text PRIMARY KEY,
  company text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ipo_sent TO service_role;
ALTER TABLE public.ipo_sent ENABLE ROW LEVEL SECURITY;

-- 2) Reschedule funds digest → Monday 9:30 AM IST (04:00 UTC Mon)
SELECT cron.unschedule('funds-daily-digest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='funds-daily-digest');
SELECT cron.schedule(
  'funds-weekly-monday',
  '0 4 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://project--d02f8969-09ba-465f-b56a-6c69845c14f9-dev.lovable.app/api/public/hooks/funds-alert',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3) Reschedule news → every 10 min during market hours (was every minute)
SELECT cron.unschedule('company-news-market-hours') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='company-news-market-hours');
SELECT cron.schedule(
  'company-news-batched-10m',
  '*/10 3-9 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://project--d02f8969-09ba-465f-b56a-6c69845c14f9-dev.lovable.app/api/public/hooks/news-alert',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
