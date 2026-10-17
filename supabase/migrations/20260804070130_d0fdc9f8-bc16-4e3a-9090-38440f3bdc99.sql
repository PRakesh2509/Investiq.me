select cron.schedule(
  'ai-aplus-trade-alert',
  '*/15 3-10 * * 1-5',
  $$
  select net.http_post(
    url:='https://project--d02f8969-09ba-465f-b56a-6c69845c14f9-dev.lovable.app/api/public/hooks/ai-trade-alert',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb) as request_id;
  $$
);