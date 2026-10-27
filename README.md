# InvestIQ

AI-assisted research and trading dashboard for Indian (NSE) and US markets: live charts,
IPO analysis, mutual funds, an F&O terminal (option chain, Greeks, ranked trade candidates),
and scheduled Telegram alerts. Built with TanStack Start (React 19, Vite 8, Nitro) and deployed
to Cloudflare Workers; Supabase provides the database.

Production: https://investiq-me.rakeshpavuluri999.workers.dev

> **Lovable sync.** This repository is connected to [Lovable](https://lovable.dev). Do not
> rewrite published git history (no force-push, and no rebase/amend/squash of commits that are
> already pushed), otherwise Lovable loses the project history. Commits pushed to the connected
> branch sync back into the Lovable editor, so keep that branch in a working state.

## Architecture

```text
src/
  routes/              File-based routes (TanStack Router). Pages are desktop.*.tsx and index.tsx.
    api/               Server routes (JSON APIs). See "Server routes" below.
    api/public/hooks/  Cron/webhook endpoints: news, IPO, RSI, funds, pre/post-market, AI trade
                       alert, Telegram bot. All require authentication.
  components/          UI (terminal, option chain, tradingview widgets, shadcn/ui in ui/)
  context/             Client state: AdminContext, OnboardingContext
  lib/                 Data engines and services (Dhan, Upstox, Groww, Sensibull, Yahoo, IPO,
                       funds, F&O engine, Greeks, scoring, backtest, regime detection)
    *.server.ts        Server-only modules (secrets, service-role Supabase, provider tokens).
                       Never import these from client code.
    *.functions.ts     TanStack server functions callable from the browser.
    cron-schedule.ts   Cron expression -> hook mapping used by the scheduler.
  server-plugins/      Nitro plugins (cron.ts: Cloudflare Cron Triggers -> hooks).
  integrations/supabase/  Browser client (publishable key), service-role client (server only),
                       generated types.
  server.ts            SSR entry wrapper (error page, h3 swallowed-error recovery).
  start.ts             TanStack Start instance (error middleware, auth attacher).
supabase/              config.toml (project link only) and SQL migrations.
wrangler.jsonc         Cloudflare Workers config (name, flags, cron triggers).
```

Build pipeline: `vite build` runs TanStack Start and then Nitro with the `cloudflare-module`
preset (via `@lovable.dev/vite-tanstack-config`). Output is `.output/`:

- `.output/server/index.mjs` is the Worker entry, `.output/public/` holds static assets (served
  through the `ASSETS` binding).
- Nitro merges `wrangler.jsonc` into `.output/server/wrangler.json` (adding `main` and `assets`)
  and writes `.wrangler/deploy/config.json`, so `wrangler deploy` from the repo root deploys the
  build output automatically. Always build before deploying.

### Server routes

| Prefix                           | Purpose                                                            | Auth                                                                       |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `/api/admin/*`                   | Admin session login/logout and API key management                  | Admin session cookie                                                       |
| `/api/v1/*`                      | Programmatic trade signals, orders, dispatch to external endpoints | API key (`NSE_FNO_API_KEY` / `GLOBAL_API_KEY` or hashed key in `api_keys`) |
| `/api/public/hooks/*`            | Alert hooks (news, IPO, RSI, funds, pre/post-market, AI trades)    | `x-cron-secret` = `CRON_SECRET`                                            |
| `/api/public/hooks/telegram-bot` | Telegram webhook                                                   | `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`              |
| `/api/public/option-chain`       | Public option chain feed                                           | `OPTION_CHAIN_API_KEY`                                                     |
| `/api/fno/*`, `/api/*`           | Data endpoints used by the dashboard                               | See route files                                                            |

## Local setup

Requirements: Node.js 22+ and npm, or bun (Lovable uses bun; `bun.lock` is the canonical lockfile).

```bash
bun install            # or: npm install   (npm lockfiles are git-ignored)
cp .env.example .env   # then fill in the values you need (see below)
npm run dev            # http://localhost:8080
```

Scripts:

| Script              | What it does                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server (port 8080; Vite picks the next free port if it is taken)               |
| `npm run build`     | Production build to `.output/` (Worker + assets)                                        |
| `npm run lint`      | ESLint (with Prettier rules)                                                            |
| `npm run typecheck` | `tsc --noEmit`                                                                          |
| `npm test`          | `node:test` over `src/lib/__tests__/*.test.ts` (Node 22+, no extra dependencies)        |
| `npm run check`     | lint + typecheck + test                                                                 |
| `npm run format`    | Prettier write                                                                          |
| `npm run cf:dev`    | Build, then run the Worker locally with `wrangler dev` (put server vars in `.dev.vars`) |
| `npm run cf:deploy` | Build, then `wrangler deploy` (needs `wrangler login` or `CLOUDFLARE_API_TOKEN`)        |

Wrangler is run through `npx`; it is intentionally not a project dependency.

### Supabase configuration

The Supabase project URL and publishable (anon) key are not stored in the repo. Copy them from
Supabase dashboard > Project Settings > API into `.env`:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (browser,
  baked into the bundle at build time; these are public by design and protected by RLS)
- `SUPABASE_SERVICE_ROLE_KEY` (secret, server only; bypasses RLS)

The publishable key is protected by Row Level Security, not by secrecy. The service-role key must
never be exposed to the browser or committed. Apply migrations from `supabase/migrations/` with
the Supabase CLI (`supabase db push`) or the dashboard SQL editor.

## Environment variables

Full list with comments is in [`.env.example`](.env.example). Server variables are read at
request time via `process.env` (available on Workers through the `nodejs_compat` flag).

| Variable                                                                                                                   | Secret  | Purpose                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`                                           | no      | Browser Supabase client (build time)                                         |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`                                                                                 | no      | Server-side overrides (default to the `VITE_*` values)                       |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                                                | **yes** | Service-role Supabase client (hook dedupe, API keys, orders)                 |
| `PROD_URL`, `VITE_PROD_URL`                                                                                                | no      | Public base URL (defaults to the workers.dev URL)                            |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`                                                                                         | **yes** | Admin console login                                                          |
| `ADMIN_SESSION_SECRET`                                                                                                     | **yes** | HMAC key for the admin session cookie (>= 32 chars)                          |
| `NSE_FNO_API_KEY`, `GLOBAL_API_KEY`                                                                                        | **yes** | API keys for `/api/v1/*` (comma-separated for rotation)                      |
| `OPTION_CHAIN_API_KEY`                                                                                                     | **yes** | Key for `/api/public/option-chain`                                           |
| `ALLOWED_ORIGINS`                                                                                                          | no      | Extra CORS origins (comma-separated)                                         |
| `DISPATCH_ALLOWED_HOSTS`                                                                                                   | no      | Hostnames the trade dispatcher may call (comma-separated)                    |
| `CRON_SECRET`                                                                                                              | **yes** | Authenticates cron/alert hooks (`x-cron-secret`)                             |
| `TELEGRAM_WEBHOOK_SECRET`                                                                                                  | **yes** | Authenticates Telegram webhook calls                                         |
| `TELEGRAM_BOT_TOKEN`                                                                                                       | **yes** | Telegram bot                                                                 |
| `TELEGRAM_CHAT_ID`                                                                                                         | no      | Alert recipients (comma-separated)                                           |
| `GEMINI_API_KEY`, `LOVABLE_API_KEY`                                                                                        | **yes** | AI providers                                                                 |
| `DHAN_CLIENT_ID`, `DHAN_ACCESS_TOKEN`                                                                                      | **yes** | DhanHQ API                                                                   |
| `UPSTOX_ACCESS_TOKEN`, `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`                                                          | **yes** | Upstox                                                                       |
| `GROWW_API_KEY`, `GROWW_API_SECRET`                                                                                        | **yes** | Groww                                                                        |
| `SENSIBULL_PARTNER_API_KEY`, `SENSIBULL_PARTNER_SECRET`, `SENSIBULL_PARTNER_API_BASE_URL`, `SENSIBULL_PARTNER_GREEKS_PATH` | **yes** | Sensibull authorised partner API only (no session cookies or tokens)         |
| `ENABLE_GLOBAL_OPTIONS_FEED`                                                                                               | no      | `true` enables the delayed CBOE US options feed (check its terms first)      |
| `ALLOW_RUNTIME_DHAN_CONNECT`                                                                                               | no      | Leave unset in production; `true` lets any visitor swap the Dhan credentials |
| `RSI_SHEET_URL`, `RSI_SHEET_NAME`                                                                                          | no      | Google Sheet for the RSI alert                                               |
| `ALLOW_MOCK_DATA`                                                                                                          | no      | `true` enables synthetic data. Leave unset in production                     |

Set production secrets on the Worker (each command prompts for the value; nothing is stored in git):

```bash
npx wrangler secret put CRON_SECRET
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put NSE_FNO_API_KEY
npx wrangler secret put GLOBAL_API_KEY
# ...plus any provider keys you use (DHAN_*, UPSTOX_*, GROWW_*, SENSIBULL_*)
```

Generate random secrets with `openssl rand -hex 32`. Non-secret values (`PROD_URL`,
`ALLOWED_ORIGINS`, ...) can also be set as secrets or in the Cloudflare dashboard; `wrangler.jsonc`
deliberately contains no `vars`.

## Deployment (Cloudflare Workers)

Manual:

```bash
npx wrangler login
npm run cf:deploy       # = npm run build && npx wrangler deploy
```

CI/CD (GitHub Actions):

- `.github/workflows/ci.yml` runs on pull requests and pushes: install (`bun install
--frozen-lockfile`), lint, typecheck, test, build.
- `.github/workflows/deploy-cloudflare.yml` runs after CI succeeds on `main` (or manually),
  builds, and deploys with `cloudflare/wrangler-action`.

Configure in GitHub (Settings > Secrets and variables > Actions):

| Name                                                                             | Kind                 | Value                                               |
| -------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                                                           | secret               | API token with "Edit Cloudflare Workers" permission |
| `CLOUDFLARE_ACCOUNT_ID`                                                          | secret               | Your Cloudflare account id                          |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | variable (or secret) | Public Supabase values baked into the bundle        |
| `VITE_PROD_URL`                                                                  | variable (optional)  | Public base URL                                     |

There are no hardcoded fallbacks; a build without these variables produces a client that cannot
reach Supabase.

## Scheduled jobs (Cron Triggers)

`wrangler.jsonc` declares Cloudflare Cron Triggers (UTC). When one fires, a Nitro plugin
(`src/server-plugins/cron.ts`) sends `POST` requests straight into the app's own fetch handler
(no network hop) with the `x-cron-secret` header taken from the `CRON_SECRET` secret. The mapping
lives in `src/lib/cron-schedule.ts` and is unit-tested against `wrangler.jsonc`. All times are
Monday to Friday.

| Cron (UTC)          | IST                       | Hooks                                                   |
| ------------------- | ------------------------- | ------------------------------------------------------- |
| `15 3 * * 1-5`      | 08:45                     | `premarket-alert`                                       |
| `15 6 * * 1-5`      | 11:45                     | `rsi-alert`, `funds-alert`, `ipo-alert`                 |
| `15 10 * * 1-5`     | 15:45                     | `postmarket-alert`                                      |
| `*/10 3-10 * * 1-5` | every 10 min, 08:30-16:20 | `news-alert`                                            |
| `*/15 3-10 * * 1-5` | every 15 min, 08:30-16:20 | `ai-trade-alert` (skips itself outside 09:15-15:30 IST) |

NSE holidays are not modelled; hooks run on holidays and should handle empty data. To change a
schedule, edit both `wrangler.jsonc` and `src/lib/cron-schedule.ts` (the test fails if they
diverge). Workers Free allows 5 cron triggers per account, which is exactly what is used here.
Without `CRON_SECRET` the hooks answer 503 and no alerts are sent.

Test locally after a build: `npx wrangler dev --test-scheduled`, then
`curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+3-10+*+*+1-5"`.

Telegram webhook (one-time, after setting `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`):

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://investiq-me.rakeshpavuluri999.workers.dev/api/public/hooks/telegram-bot" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## Security model

- **Admin console**: username/password from `ADMIN_USERNAME` / `ADMIN_PASSWORD` produce an
  HMAC-signed, HttpOnly session cookie (`iq_admin_session`, 12 h) keyed by `ADMIN_SESSION_SECRET`.
  Rotating any of the three invalidates all sessions. If they are unset, admin endpoints fail
  closed (503).
- **API keys** (`/api/v1/*`): checked against `NSE_FNO_API_KEY` / `GLOBAL_API_KEY` or against
  SHA-256 hashes in the `api_keys` table (plaintext keys are never stored). CORS is an allow-list
  (app origin plus `ALLOWED_ORIGINS`), never a wildcard.
- **Cron hooks**: every `/api/public/hooks/*` endpoint requires `CRON_SECRET` (constant-time
  comparison, fail closed when unset).
- **Telegram webhook**: verified via `X-Telegram-Bot-Api-Secret-Token` against
  `TELEGRAM_WEBHOOK_SECRET`.
- **Supabase**: the browser only holds the publishable key and is constrained by RLS; the
  service-role key lives only in Worker secrets and `*.server.ts` modules.
- **Secrets hygiene**: no secrets in tracked files; `.env` and `.dev.vars` are git-ignored.
  `.env.example` contains names only.
- **Outbound dispatch**: trade dispatch only calls hosts in `DISPATCH_ALLOWED_HOSTS`.

## Contributing

Run `npm run check` before pushing. Do not edit `src/routeTree.gen.ts` (generated). Respect the
Lovable note at the top: never rewrite history that is already pushed.
