-- RLS hardening. Idempotent and safe to re-run on the live database.
--
-- Audit summary of earlier migrations:
--   news_sent       RLS on; "service role only" FOR ALL USING (false) BUT
--                   `GRANT SELECT, INSERT ... TO authenticated` was left in place.
--   ipo_sent        RLS on; anon/authenticated revoked; service_role policy.
--   ai_trade_sent   RLS on; service_role policy; default Supabase grants to
--                   anon/authenticated were never revoked.
--   upstox_tokens   created then DROPPED (20260803154759); handled below only
--                   in case it exists on the live DB (holds broker tokens).
-- All of these tables are server-only (written/read through the service-role
-- key by /api/public/hooks/*). service_role has BYPASSRLS, so the explicit
-- service_role policies below are belt-and-braces documentation.

-- 1) Enable RLS on every table in public (deny-by-default when no policy exists).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2) Server-only tables: drop permissive/legacy policies, FORCE RLS, strip
--    anon/authenticated privileges, keep service_role.
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'news_sent', 'ipo_sent', 'ai_trade_sent', 'upstox_tokens', 'api_keys', 'paper_orders'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    -- Drop every existing policy that is not scoped to service_role only
    -- (covers the legacy "service role only" USING (false) PUBLIC policy and
    -- anything granted to anon/authenticated/public).
    FOR pol IN
      SELECT policyname, roles
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      IF pol.roles IS DISTINCT FROM ARRAY['service_role']::name[] THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END IF;
    END LOOP;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_all', t
    );
  END LOOP;
END $$;

-- 3) Dedupe keys: nothing to add. news_sent.guid and ipo_sent.ipo_id are PKs and
--    ai_trade_sent has UNIQUE (trade_key, sent_date), so the hooks' insert-as-lock
--    pattern is already race-safe and no duplicates can exist.

-- 4) Future tables created in public no longer get automatic anon/authenticated
--    grants from this role; new migrations must GRANT explicitly (as earlier ones do).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
