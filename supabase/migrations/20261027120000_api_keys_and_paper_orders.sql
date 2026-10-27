-- API keys (hashed) and persisted paper orders.
-- Both tables are service-role only: RLS is enabled with NO policies for anon/authenticated,
-- so only the service role (which bypasses RLS) can read or write them.

CREATE TABLE IF NOT EXISTS public.api_keys (
  scope        text PRIMARY KEY CHECK (scope IN ('nse', 'global')),
  key_hash     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

COMMENT ON TABLE public.api_keys IS
  'One active SHA-256 hashed API key per scope (nse|global). Plaintext keys are never stored. Service role only.';

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_keys FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.paper_orders (
  order_id       text PRIMARY KEY,
  status         text NOT NULL DEFAULT 'FILLED',
  market         text NOT NULL CHECK (market IN ('NSE_FNO', 'GLOBAL_US')),
  symbol         text NOT NULL,
  contract       text NOT NULL,
  action         text NOT NULL CHECK (action IN ('BUY', 'SELL')),
  order_type     text NOT NULL DEFAULT 'MARKET',
  lots           integer NOT NULL CHECK (lots > 0),
  lot_size       numeric NOT NULL,
  total_quantity numeric NOT NULL,
  fill_price     numeric NOT NULL,
  currency       text NOT NULL,
  total_outlay   numeric NOT NULL,
  target1        numeric,
  target2        numeric,
  target3        numeric,
  stop_loss      numeric,
  timing_note    text,
  source         text,
  price_source   text NOT NULL DEFAULT 'trade_setup',
  is_simulated   boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paper_orders IS
  'Simulated (paper) orders placed through /api/v1/trades. Service role only.';

CREATE INDEX IF NOT EXISTS paper_orders_market_created_idx
  ON public.paper_orders (market, created_at DESC);

ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paper_orders FROM anon, authenticated;
