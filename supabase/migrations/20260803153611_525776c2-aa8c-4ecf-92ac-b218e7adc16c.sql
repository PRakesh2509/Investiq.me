CREATE TABLE public.upstox_tokens (
  id text PRIMARY KEY DEFAULT 'default',
  access_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  upstox_user_id text,
  upstox_email text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.upstox_tokens TO service_role;

ALTER TABLE public.upstox_tokens ENABLE ROW LEVEL SECURITY;