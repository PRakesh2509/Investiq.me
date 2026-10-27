-- Alert scheduling moved to Cloudflare Workers cron triggers (see wrangler.jsonc and
-- src/lib/cron-schedule.ts). The old pg_cron jobs POST to a retired lovable.app dev URL
-- without the CRON_SECRET header the hooks now require, so remove them.
-- Idempotent: safe if pg_cron is not installed or a job no longer exists.
DO $$
DECLARE
  job text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOREACH job IN ARRAY ARRAY[
      'funds-daily-digest',
      'funds-weekly-monday',
      'company-news-market-hours',
      'company-news-batched-10m',
      'ai-aplus-trade-alert',
      'fno-usa-open'
    ]
    LOOP
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job) THEN
        PERFORM cron.unschedule(job);
      END IF;
    END LOOP;
  END IF;
END
$$;
