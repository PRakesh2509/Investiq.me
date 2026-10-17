import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCw, Search, AlertTriangle, Radio, KeyRound, Send, BellRing, Scale, X, Sparkles,
} from "lucide-react";
import type { AiTradePlan } from "@/lib/ai-trades";

type Side = {
  ltp: number; close: number; volume: number; oi: number; prevOi: number; oiChange: number;
  bid: number; bidQty: number; ask: number; askQty: number;
  iv: number; delta: number; gamma: number; theta: number; vega: number;
};
type Row = { strike: number; call: Side; put: Side };
type Chain = {
  underlyingKey: string; expiry: string; spot: number; atmStrike: number;
  pcr: number; maxPain: number; totalCallOi: number; totalPutOi: number;
  rows: Row[]; generatedAt: number;
};
type Underlying = { key: string; label: string; segment: "INDEX" | "EQ" };
type View = "both" | "CE" | "PE";

const REFRESH_MS = 2000;

const n2 = (v: number, d = 2) =>
  Number.isFinite(v) ? v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const compact = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
};

type AlertPayload = Record<string, unknown>;
async function notifyTelegram(payload: AlertPayload) {
  try {
    const r = await fetch("/api/option-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((x) => x.json());
    return !!r.ok;
  } catch {
    return false;
  }
}

export default function OptionChain() {
  const [underlyings, setUnderlyings] = useState<Underlying[]>([]);
  const [selected, setSelected] = useState<Underlying | null>(null);
  const [query, setQuery] = useState("");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [chain, setChain] = useState<Chain | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  /* filters */
  const [view, setView] = useState<View>("both");
  const [range, setRange] = useState(10); // strikes each side of ATM (0 = all)
  const [minVolume, setMinVolume] = useState(0);
  const [minOi, setMinOi] = useState(0);

  /* compare + alerts */
  const [compare, setCompare] = useState<number[]>([]);
  const [autoAlerts, setAutoAlerts] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* AI premium trades */
  const [aiPlan, setAiPlan] = useState<AiTradePlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [testSymbol, setTestSymbol] = useState("NIFTY");
  const [testLoading, setTestLoading] = useState(false);
  const alertedRef = useRef<Set<string>>(new Set());

  const atmRef = useRef<HTMLTableRowElement | null>(null);
  const scrolledFor = useRef<string>("");

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  /* ------------------------------- bootstrap ------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/search?q=").then((x) => x.json());
        if (!alive) return;
        if (!r.ok) { setError(r.error); setMissing(r.missing ?? null); setTokenExpired(!!r.tokenExpired); setLoading(false); return; }
        setTokenExpired(false);
        setUnderlyings(r.results);
        setSelected(r.results[0] ?? null);
      } catch (e) {
        if (alive) { setError((e as Error).message); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, []);

  /* -------------------------------- search -------------------------------- */
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((x) => x.json());
        if (r.ok) setUnderlyings(r.results);
      } catch { /* keep previous list */ }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  /* ------------------------------- expiries ------------------------------- */
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setExpiries([]); setExpiry(""); setChain(null); setLoading(true); setError(null);
    setCompare([]); alertedRef.current = new Set();
    (async () => {
      try {
        const r = await fetch(`/api/expiries?instrument_key=${encodeURIComponent(selected.key)}`).then((x) => x.json());
        if (!alive) return;
        if (!r.ok) { setError(r.error); setMissing(r.missing ?? null); setTokenExpired(!!r.tokenExpired); setLoading(false); return; }
        setTokenExpired(false);
        setExpiries(r.expiries);
        setExpiry(r.expiries[0] ?? "");
        if (!r.expiries.length) { setLoading(false); setError("No option expiries available for this underlying."); }
      } catch (e) {
        if (alive) { setError((e as Error).message); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [selected]);

  /* ------------------------------ chain fetch ----------------------------- */
  const loadChain = useCallback(async (silent = false) => {
    if (!selected || !expiry) return;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(
        `/api/option-chain?instrument_key=${encodeURIComponent(selected.key)}&expiry=${encodeURIComponent(expiry)}`,
      ).then((x) => x.json());
      if (!r.ok) { setError(r.error); setMissing(r.missing ?? null); setTokenExpired(!!r.tokenExpired); setLive(false); return; }
      setChain(r.chain); setError(null); setMissing(null); setTokenExpired(false); setLive(true);
    } catch (e) {
      setError((e as Error).message); setLive(false);
    } finally {
      setLoading(false);
    }
  }, [selected, expiry]);

  /* ------------------- live polling loop with auto-recovery ---------------- */
  useEffect(() => {
    if (!selected || !expiry) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let backoff = REFRESH_MS;

    const tick = async () => {
      if (!alive) return;
      const before = Date.now();
      await loadChain(true);
      if (!alive) return;
      backoff = Date.now() - before > 4000 ? Math.min(backoff * 2, 30000) : REFRESH_MS;
      timer = setTimeout(tick, backoff);
    };

    loadChain(false).then(() => { if (alive) timer = setTimeout(tick, REFRESH_MS); });

    const onVisible = () => { if (document.visibilityState === "visible") loadChain(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [selected, expiry, loadChain]);

  /* -------------------------- scroll ATM into view ------------------------- */
  useEffect(() => {
    if (!chain) return;
    const key = `${chain.underlyingKey}|${chain.expiry}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    atmRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [chain]);

  /* ------------------- unusual activity → Telegram alerts ------------------ */
  useEffect(() => {
    if (!autoAlerts || !chain || !selected) return;
    for (const r of chain.rows) {
      for (const [type, s] of [["CE", r.call], ["PE", r.put]] as const) {
        const spike = s.prevOi > 0 && s.oiChange / s.prevOi > 0.5 && s.oiChange > 50000;
        const ivSpike = s.iv > 60 && s.volume > 10000;
        if (!spike && !ivSpike) continue;
        const key = `${chain.expiry}|${r.strike}|${type}|${spike ? "oi" : "iv"}`;
        if (alertedRef.current.has(key)) continue;
        alertedRef.current.add(key);
        void notifyTelegram({
          kind: spike ? "unusual" : "volatility",
          symbol: selected.label,
          expiry: chain.expiry,
          strike: r.strike,
          optionType: type,
          ltp: s.ltp,
          iv: s.iv,
          oiChange: s.oiChange,
          note: spike
            ? "Open interest build-up detected well above the previous session."
            : "Implied volatility running hot with heavy volume.",
        });
      }
    }
  }, [autoAlerts, chain, selected]);

  const maxOi = useMemo(
    () => (chain ? Math.max(1, ...chain.rows.flatMap((r) => [r.call.oi, r.put.oi])) : 1),
    [chain],
  );

  /* --------------------------------- rows --------------------------------- */
  const rows = useMemo(() => {
    if (!chain) return [];
    let out = chain.rows;
    if (range > 0) {
      const atmIdx = out.findIndex((r) => r.strike === chain.atmStrike);
      if (atmIdx >= 0) out = out.slice(Math.max(0, atmIdx - range), atmIdx + range + 1);
    }
    if (minVolume > 0 || minOi > 0) {
      out = out.filter((r) => {
        const vol = view === "PE" ? r.put.volume : view === "CE" ? r.call.volume : Math.max(r.call.volume, r.put.volume);
        const oi = view === "PE" ? r.put.oi : view === "CE" ? r.call.oi : Math.max(r.call.oi, r.put.oi);
        return vol >= minVolume && oi >= minOi;
      });
    }
    return out;
  }, [chain, range, minVolume, minOi, view]);

  const compareRows = useMemo(
    () => (chain ? chain.rows.filter((r) => compare.includes(r.strike)) : []),
    [chain, compare],
  );

  const toggleCompare = (strike: number) =>
    setCompare((c) => (c.includes(strike) ? c.filter((s) => s !== strike) : [...c, strike].slice(-4)));

  const runAiTrades = async (notify: boolean) => {
    if (!selected || !expiry) return;
    setAiLoading(true); setAiError(null);
    try {
      const r = await fetch("/api/ai-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_key: selected.key,
          symbol: selected.label,
          expiry,
          notify,
        }),
      }).then((x) => x.json());
      if (!r.ok) { setAiError(r.error ?? "AI request failed"); return; }
      setAiPlan(r.plan);
      flash(
        notify
          ? `${r.plan.trades.length} AI trade(s) sent to ${r.notified?.sent ?? 0} Telegram chats`
          : `${r.plan.trades.length} AI trade(s) generated`,
      );
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const sendTestTrade = async () => {
    setTestLoading(true); setAiError(null);
    try {
      const r = await fetch("/api/test-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: testSymbol }),
      }).then((x) => x.json());
      if (!r.ok) { setAiError(r.error ?? "Test trade failed"); return; }
      setAiPlan(r.plan);
      flash(
        `Test ${r.symbol} · ${r.plan.trades.length} trade(s) with reasons sent to ${r.notified?.sent ?? 0} Telegram chats`,
      );
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setTestLoading(false);
    }
  };



  const sendTrade = async (r: Row, type: "CE" | "PE", direction: "BUY" | "SELL") => {
    const s = type === "CE" ? r.call : r.put;
    const ok = await notifyTelegram({
      kind: "order",
      symbol: selected?.label,
      expiry: chain?.expiry,
      strike: r.strike,
      optionType: type,
      direction,
      qty: 1,
      entry: direction === "BUY" ? s.ask || s.ltp : s.bid || s.ltp,
      ltp: s.ltp,
      iv: s.iv,
      force: true,
    });
    flash(ok ? `${direction} ${r.strike} ${type} sent to Telegram` : "Telegram alert failed");
  };

  if (tokenExpired && !missing?.length) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-8 text-center">
        <KeyRound className="mx-auto h-8 w-8 text-danger" />
        <h2 className="mt-3 font-display text-xl font-semibold">Upstox access token expired</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          UPSTOX_ACCESS_TOKEN has expired. Update the environment variable in Vercel and redeploy.
        </p>
      </div>
    );
  }

  if (missing?.length) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6">
        <div className="flex items-center gap-2 font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" /> Upstox configuration incomplete
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The following environment variable(s) are missing on the server:
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {missing.map((m) => (
            <li key={m} className="font-mono text-destructive">{m}</li>
          ))}
        </ul>
      </div>
    );
  }

  const showCall = view !== "PE";
  const showPut = view !== "CE";

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Search underlying</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="NIFTY, BANKNIFTY, RELIANCE…"
              className="h-10 w-full rounded-lg border border-border bg-surface/60 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Expiry</label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            disabled={!expiries.length}
            className="mt-1 h-10 rounded-lg border border-border bg-surface/60 px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
          >
            {expiries.length === 0 && <option value="">—</option>}
            {expiries.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <button
          onClick={() => loadChain(false)}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface/60 px-4 text-xs hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Underlying chips */}
      <div className="flex flex-wrap gap-2">
        {underlyings.map((u) => (
          <button
            key={u.key}
            onClick={() => setSelected(u)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              selected?.key === u.key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface/40 p-3">
        <Field label="Option type">
          <div className="inline-flex rounded-lg border border-border bg-background/60 p-0.5">
            {(["both", "CE", "PE"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  v === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "both" ? "Both" : v}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Strikes around ATM">
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
          >
            {[5, 10, 15, 20, 0].map((v) => (
              <option key={v} value={v}>{v === 0 ? "All strikes" : `± ${v}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Min volume">
          <input
            type="number" min={0} step={1000} value={minVolume}
            onChange={(e) => setMinVolume(Math.max(0, Number(e.target.value)))}
            className="h-8 w-28 rounded-lg border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
          />
        </Field>
        <Field label="Min open interest">
          <input
            type="number" min={0} step={10000} value={minOi}
            onChange={(e) => setMinOi(Math.max(0, Number(e.target.value)))}
            className="h-8 w-28 rounded-lg border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
          />
        </Field>
        <button
          onClick={() => setAutoAlerts((a) => !a)}
          className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition ${
            autoAlerts
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <BellRing className={`h-3.5 w-3.5 ${autoAlerts ? "animate-pulse" : ""}`} />
          Telegram alerts {autoAlerts ? "ON" : "OFF"}
        </button>
      </div>

      {error && !missing && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Spot (LTP)" value={chain ? n2(chain.spot) : "—"} accent="primary" />
        <Kpi label="ATM Strike" value={chain ? n2(chain.atmStrike, 0) : "—"} />
        <Kpi label="PCR (OI)" value={chain ? chain.pcr.toFixed(2) : "—"}
          accent={chain ? (chain.pcr >= 1 ? "success" : "destructive") : undefined} />
        <Kpi label="Max Pain" value={chain ? n2(chain.maxPain, 0) : "—"} />
        <Kpi
          label="Total CE / PE OI"
          value={chain ? `${compact(chain.totalCallOi)} / ${compact(chain.totalPutOi)}` : "—"}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Radio className={`h-3 w-3 ${live ? "animate-pulse text-success" : "text-muted-foreground"}`} />
          {live ? `Live · auto-refresh ${REFRESH_MS / 1000}s` : "Reconnecting…"}
        </span>
        {chain && <span suppressHydrationWarning>Updated {new Date(chain.generatedAt).toLocaleTimeString("en-IN")}</span>}
      </div>

      {/* AI premium trades */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> AI Premium Trades
          </div>
          <span className="text-[11px] text-muted-foreground">
            High-conviction setups from the live chain — educational only.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => runAiTrades(false)}
              disabled={aiLoading || !chain}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-pulse" : ""}`} />
              {aiLoading ? "Analysing…" : "Generate"}
            </button>
            <button
              onClick={() => runAiTrades(true)}
              disabled={aiLoading || !chain}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Generate &amp; Notify
            </button>
          </div>
        </div>

        {/* Test message dispatcher */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-surface/40 p-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Test Telegram message
          </span>
          <select
            value={testSymbol}
            onChange={(e) => setTestSymbol(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="NIFTY">NIFTY 50</option>
            <option value="BANKNIFTY">BANK NIFTY</option>
            <option value="SENSEX">SENSEX</option>
          </select>
          <button
            onClick={sendTestTrade}
            disabled={testLoading}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-primary/50 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Send className={`h-3.5 w-3.5 ${testLoading ? "animate-pulse" : ""}`} />
            {testLoading ? "Sending…" : "Send Test Trade"}
          </button>
          <span className="text-[10px] text-muted-foreground">
            Sends live trades with reasons to all Telegram recipients, ignoring market hours.
          </span>
        </div>


        {aiError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{aiError}</span>
          </div>
        )}

        {aiPlan && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{aiPlan.marketView}</p>
            {aiPlan.trades.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface/40 p-4 text-center text-xs text-muted-foreground">
                No high-conviction setup in this snapshot.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {aiPlan.trades.map((t) => (
                  <div key={`${t.rank}-${t.strike}-${t.optionType}`} className="rounded-xl border border-border bg-surface/60 p-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{t.grade}</span>
                      <span className="text-sm font-semibold">
                        {t.direction} {n2(t.strike, 0)} {t.optionType}
                      </span>
                      <span className={`ml-auto text-[11px] font-semibold ${t.bias === "BULLISH" ? "text-success" : t.bias === "BEARISH" ? "text-destructive" : "text-muted-foreground"}`}>
                        {t.bias}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{t.strategy}</div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                      <Stat label="Entry" value={n2(t.entry)} />
                      <Stat label="Target" value={n2(t.target)} />
                      <Stat label="Stop" value={n2(t.stop)} />
                      <Stat label="R:R" value={t.rr.toFixed(2)} />
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                      <div className="h-full bg-primary" style={{ width: `${t.confidence}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">Confidence {t.confidence}%</div>
                    {t.rationale.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                        {t.rationale.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
                      </ul>
                    )}
                    <div className="mt-2 text-[10px] text-destructive">⛔ {t.invalidation}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">⚠️ {aiPlan.caution}</p>
          </div>
        )}
      </div>

      {/* Compare panel */}
      {compareRows.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
            <Scale className="h-3.5 w-3.5" /> Comparing {compareRows.length} strike{compareRows.length > 1 ? "s" : ""}
            <button onClick={() => setCompare([])} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-[11px]">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Strike</th>
                  <th className="px-2 py-1">CE LTP</th>
                  <th className="px-2 py-1">CE IV</th>
                  <th className="px-2 py-1">CE Δ</th>
                  <th className="px-2 py-1">CE OI</th>
                  <th className="px-2 py-1">PE LTP</th>
                  <th className="px-2 py-1">PE IV</th>
                  <th className="px-2 py-1">PE Δ</th>
                  <th className="px-2 py-1">PE OI</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.strike} className="border-t border-border/50">
                    <td className="px-2 py-1 text-left font-semibold">{n2(r.strike, 0)}</td>
                    <td className="px-2 py-1">{n2(r.call.ltp)}</td>
                    <td className="px-2 py-1">{r.call.iv ? r.call.iv.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1">{r.call.delta.toFixed(3)}</td>
                    <td className="px-2 py-1">{compact(r.call.oi)}</td>
                    <td className="px-2 py-1">{n2(r.put.ltp)}</td>
                    <td className="px-2 py-1">{r.put.iv ? r.put.iv.toFixed(1) : "—"}</td>
                    <td className="px-2 py-1">{r.put.delta.toFixed(3)}</td>
                    <td className="px-2 py-1">{compact(r.put.oi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chain table */}
      {loading && !chain ? (
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-surface/40" />
      ) : !chain || rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          No option chain data for this selection or filters.
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-border bg-surface/40">
          <table className="w-full min-w-[1200px] border-collapse text-right text-xs">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {showCall && <th colSpan={11} className="border-b border-border px-2 py-2 text-center text-success">Calls (CE)</th>}
                <th className="border-b border-x border-border px-2 py-2 text-center">Strike</th>
                {showPut && <th colSpan={11} className="border-b border-border px-2 py-2 text-center text-destructive">Puts (PE)</th>}
              </tr>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {showCall && ["OI", "Chg OI", "Vol", "IV", "Delta", "Gamma", "Theta", "Vega", "Bid/Ask", "LTP", "Trade"].map((h) => (
                  <th key={`c-${h}`} className="border-b border-border px-2 py-2 font-medium">{h}</th>
                ))}
                <th className="border-b border-x border-border px-2 py-2 text-center font-medium">Price</th>
                {showPut && ["Trade", "LTP", "Bid/Ask", "Vega", "Theta", "Gamma", "Delta", "IV", "Vol", "Chg OI", "OI"].map((h) => (
                  <th key={`p-${h}`} className="border-b border-border px-2 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isAtm = r.strike === chain.atmStrike;
                const callItm = r.strike < chain.spot;
                const putItm = r.strike > chain.spot;
                const picked = compare.includes(r.strike);
                return (
                  <tr
                    key={r.strike}
                    ref={isAtm ? atmRef : undefined}
                    className={`border-b border-border/50 transition hover:bg-accent/30 ${isAtm ? "bg-primary/10" : ""} ${picked ? "ring-1 ring-inset ring-primary/40" : ""}`}
                  >
                    {showCall && (
                      <>
                        <OiCell value={r.call.oi} max={maxOi} tone="success" />
                        <Chg value={r.call.oiChange} />
                        <Td className={callItm ? "bg-success/5" : ""}>{compact(r.call.volume)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.iv ? r.call.iv.toFixed(1) : "—"}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.delta.toFixed(3)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.gamma.toFixed(4)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.theta.toFixed(2)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.vega.toFixed(2)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{n2(r.call.bid)} / {n2(r.call.ask)}</Td>
                        <Td className={`font-semibold ${callItm ? "bg-success/5" : ""}`}>{n2(r.call.ltp)}</Td>
                        <TradeCell onBuy={() => sendTrade(r, "CE", "BUY")} onSell={() => sendTrade(r, "CE", "SELL")} />
                      </>
                    )}

                    <td className={`border-x border-border px-2 py-1.5 text-center font-semibold ${isAtm ? "text-primary" : ""}`}>
                      <button
                        onClick={() => toggleCompare(r.strike)}
                        title="Add to compare"
                        className={`rounded px-1 ${picked ? "text-primary" : "hover:text-primary"}`}
                      >
                        {n2(r.strike, 0)}
                      </button>
                      {isAtm && <span className="ml-1 rounded bg-primary/20 px-1 text-[9px] uppercase text-primary">ATM</span>}
                    </td>

                    {showPut && (
                      <>
                        <TradeCell onBuy={() => sendTrade(r, "PE", "BUY")} onSell={() => sendTrade(r, "PE", "SELL")} />
                        <Td className={`font-semibold ${putItm ? "bg-destructive/5" : ""}`}>{n2(r.put.ltp)}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{n2(r.put.bid)} / {n2(r.put.ask)}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{r.put.vega.toFixed(2)}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{r.put.theta.toFixed(2)}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{r.put.gamma.toFixed(4)}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{r.put.delta.toFixed(3)}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{r.put.iv ? r.put.iv.toFixed(1) : "—"}</Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>{compact(r.put.volume)}</Td>
                        <Chg value={r.put.oiChange} />
                        <OiCell value={r.put.oi} max={maxOi} tone="destructive" />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-surface px-4 py-2.5 text-xs font-medium shadow-lg">
          <Send className="h-3.5 w-3.5 text-primary" /> {toast}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Data via Upstox Developer API (server-side only). Trade buttons dispatch Telegram alerts — they do not place
        live broker orders. Educational use only — not investment advice.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function TradeCell({ onBuy, onSell }: { onBuy: () => void; onSell: () => void }) {
  return (
    <td className="px-2 py-1.5">
      <div className="flex justify-end gap-1">
        <button
          onClick={onBuy}
          className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold text-success hover:bg-success/20"
        >
          B
        </button>
        <button
          onClick={onSell}
          className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive hover:bg-destructive/20"
        >
          S
        </button>
      </div>
    </td>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className}`}>{children}</td>;
}

function Chg({ value }: { value: number }) {
  const tone = value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return <td className={`px-2 py-1.5 ${tone}`}>{value === 0 ? "—" : `${value > 0 ? "+" : ""}${compact(value)}`}</td>;
}

function OiCell({ value, max, tone }: { value: number; max: number; tone: "success" | "destructive" }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <td className="relative px-2 py-1.5">
      <div
        className={`absolute inset-y-0.5 right-0 rounded-l ${tone === "success" ? "bg-success/15" : "bg-destructive/15"}`}
        style={{ width: `${pct}%` }}
      />
      <span className="relative">{compact(value)}</span>
    </td>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "primary" | "success" | "destructive" }) {
  const color =
    accent === "primary" ? "text-primary" :
    accent === "success" ? "text-success" :
    accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
