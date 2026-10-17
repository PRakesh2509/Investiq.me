SELECT cron.schedule(
  'funds-daily-digest',
  '30 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://project--d02f8969-09ba-465f-b56a-6c69845c14f9-dev.lovable.app/api/public/hooks/funds-alert',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);