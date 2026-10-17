# InvestIQ — Local Setup (Antigravity / any IDE)

A TanStack Start (React 19 + Vite) trading dashboard: live charts, IPO analysis,
mutual funds, F&O views, and Telegram alerts.

## Run locally

```bash
# 1. Install dependencies (bun or npm both work)
bun install        # or: npm install

# 2. Start the dev server
bun run dev        # or: npm run dev
# → http://localhost:3000 (Vite default port)

# 3. Production build
bun run build      # or: npm run build
```

## Environment variables

Copy `.env.example` to `.env` (already included here with the public backend keys).

**Browser (public) keys — already set in `.env`:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

**Server-only secrets — set these yourself (never commit real values):**
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — Telegram alerts
- `UPSTOX_ACCESS_TOKEN` — option chain data (optional; test alerts use mock data)
- `GROWW_API_KEY`, `GROWW_API_SECRET` — Groww live data (optional; needs Live Data + Historical Data roles enabled in the Groww Trading API dashboard)
- `RSI_SHEET_URL`, `RSI_SHEET_NAME` — Google Sheet for RSI alerts (optional)

> Note: secrets stored in Lovable Cloud are not in this download. Set them in your
> own environment (`.env` locally, or your host's env settings on Vercel).

## File structure

```text
├── public/                  # Static assets (logo, favicon)
├── src/
│   ├── routes/              # Pages (TanStack Router, file-based)
│   │   ├── index.tsx        # Landing page
│   │   ├── desktop.*.tsx    # Dashboard, charts, IPOs, funds, terminal, admin…
│   │   └── api/             # Server routes (alerts, option chain, test trade)
│   │       └── public/hooks/# Telegram alert hooks (news, IPO, RSI, funds, F&O)
│   ├── components/          # UI components (terminal, tradingview, ui/kit)
│   ├── context/             # AdminContext (settings, Telegram config)
│   ├── lib/                 # Data engines: yahoo, groww, upstox, ipo, funds, fno
│   │   └── *.server.ts      # Server-only modules (read process.env)
│   ├── integrations/        # Backend client (auto-generated — do not edit)
│   ├── router.tsx / start.ts / server.ts   # App bootstrap
│   └── styles.css           # Tailwind v4 theme (Premium Dark Gold tokens)
├── supabase/migrations/     # Database schema migrations
├── package.json             # Scripts: dev / build / preview
├── vercel.json              # Vercel deployment config
└── vite.config.ts           # Vite + TanStack Start config
```

## Deploy

- **Vercel:** import the repo, it builds with `vite build` (NITRO_PRESET=vercel is set in `vercel.json`). Add the server secrets above in Project Settings → Environment Variables.
- The backend (database + auth) stays on Lovable Cloud; this code connects to it via the public keys in `.env`.
