import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Radio, KeyRound, Send } from "lucide-react";
import type { AiTradePlan } from "@/lib/ai-trades";
import { DataQualityBadges } from "./DataQualityBadges";
import { adminPost, ADMIN_REQUIRED_HINT } from "./adminFetch";
import { useAdmin } from "@/context/AdminContext";
import { ChainControls } from "./option-chain/ChainControls";
import { ChainTable } from "./option-chain/ChainTable";
import { ComparePanel } from "./option-chain/ComparePanel";
import { AiTradesPanel } from "./option-chain/AiTradesPanel";
import {
  REFRESH_MS,
  compact,
  n2,
  notifyTelegram,
  type Chain,
  type Row,
  type Underlying,
  type View,
} from "./option-chain/shared";

export default function OptionChain() {
  const { isAdmin } = useAdmin();
  const canSend = isAdmin;
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

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  /* ------------------------------- bootstrap ------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/search?q=").then((x) => x.json());
        if (!alive) return;
        if (!r.ok) {
          setError(r.error);
          setMissing(r.missing ?? null);
          setTokenExpired(!!r.tokenExpired);
          setLoading(false);
          return;
        }
        setTokenExpired(false);
        setUnderlyings(r.results);
        setSelected(r.results[0] ?? null);
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* -------------------------------- search -------------------------------- */
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((x) => x.json());
        if (r.ok) setUnderlyings(r.results);
      } catch {
        /* keep previous list */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  /* ------------------------------- expiries ------------------------------- */
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setExpiries([]);
    setExpiry("");
    setChain(null);
    setLoading(true);
    setError(null);
    setCompare([]);
    alertedRef.current = new Set();
    (async () => {
      try {
        const r = await fetch(
          `/api/expiries?instrument_key=${encodeURIComponent(selected.key)}`,
        ).then((x) => x.json());
        if (!alive) return;
        if (!r.ok) {
          setError(r.error);
          setMissing(r.missing ?? null);
          setTokenExpired(!!r.tokenExpired);
          setLoading(false);
          return;
        }
        setTokenExpired(false);
        setExpiries(r.expiries);
        setExpiry(r.expiries[0] ?? "");
        if (!r.expiries.length) {
          setLoading(false);
          setError("No option expiries available for this underlying.");
        }
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  /* ------------------------------ chain fetch ----------------------------- */
  const loadChain = useCallback(
    async (silent = false) => {
      if (!selected || !expiry) return;
      if (!silent) setLoading(true);
      try {
        const r = await fetch(
          `/api/option-chain?instrument_key=${encodeURIComponent(selected.key)}&expiry=${encodeURIComponent(expiry)}`,
        ).then((x) => x.json());
        if (!r.ok) {
          setError(r.error);
          setMissing(r.missing ?? null);
          setTokenExpired(!!r.tokenExpired);
          setLive(false);
          return;
        }
        setChain(r.chain);
        setError(null);
        setMissing(null);
        setTokenExpired(false);
        setLive(true);
      } catch (e) {
        setError((e as Error).message);
        setLive(false);
      } finally {
        setLoading(false);
      }
    },
    [selected, expiry],
  );

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

    loadChain(false).then(() => {
      if (alive) timer = setTimeout(tick, REFRESH_MS);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") loadChain(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
    if (!autoAlerts || !chain || !selected || !canSend) return;
    for (const r of chain.rows) {
      for (const [type, s] of [
        ["CE", r.call],
        ["PE", r.put],
      ] as const) {
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
        }).then((res) => {
          if (!res.ok) {
            setAutoAlerts(false);
            flash(`Telegram alert failed: ${res.error ?? "unknown error"}`);
          }
        });
      }
    }
  }, [autoAlerts, chain, selected, canSend]);

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
        const vol =
          view === "PE"
            ? r.put.volume
            : view === "CE"
              ? r.call.volume
              : Math.max(r.call.volume, r.put.volume);
        const oi =
          view === "PE" ? r.put.oi : view === "CE" ? r.call.oi : Math.max(r.call.oi, r.put.oi);
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
    setCompare((c) =>
      c.includes(strike) ? c.filter((s) => s !== strike) : [...c, strike].slice(-4),
    );

  const runAiTrades = async (notify: boolean) => {
    if (!selected || !expiry) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await adminPost<{
        plan: AiTradePlan;
        notified?: { sent?: number };
      }>("/api/ai-trades", {
        instrument_key: selected.key,
        symbol: selected.label,
        expiry,
        notify,
      });
      if (!res.ok || !res.data) {
        setAiError(res.error ?? "AI request failed");
        return;
      }
      const r = res.data;
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
    setTestLoading(true);
    setAiError(null);
    try {
      const res = await adminPost<{
        plan: AiTradePlan;
        symbol: string;
        notified?: { sent?: number };
      }>("/api/test-trade", { symbol: testSymbol });
      if (!res.ok || !res.data) {
        setAiError(res.error ?? "Test trade failed");
        return;
      }
      const r = res.data;
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
    if (!canSend) {
      flash(ADMIN_REQUIRED_HINT);
      return;
    }
    const res = await notifyTelegram({
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
    flash(
      res.ok
        ? `${direction} ${r.strike} ${type} sent to Telegram`
        : `Telegram alert failed: ${res.error ?? "unknown error"}`,
    );
  };

  if (tokenExpired && !missing?.length) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-8 text-center">
        <KeyRound className="mx-auto h-8 w-8 text-danger" />
        <h2 className="mt-3 font-display text-xl font-semibold">Upstox access token expired</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          UPSTOX_ACCESS_TOKEN has expired. Update the environment variable on the server and
          redeploy.
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
            <li key={m} className="font-mono text-destructive">
              {m}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const showCall = view !== "PE";
  const showPut = view !== "CE";

  return (
    <div className="space-y-5">
      <ChainControls
        canSend={canSend}
        query={query}
        setQuery={setQuery}
        expiry={expiry}
        setExpiry={setExpiry}
        expiries={expiries}
        loading={loading}
        onRefresh={() => loadChain(false)}
        underlyings={underlyings}
        selected={selected}
        setSelected={setSelected}
        view={view}
        setView={setView}
        range={range}
        setRange={setRange}
        minVolume={minVolume}
        setMinVolume={setMinVolume}
        minOi={minOi}
        setMinOi={setMinOi}
        autoAlerts={autoAlerts}
        setAutoAlerts={setAutoAlerts}
      />
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
        <Kpi
          label="PCR (OI)"
          value={chain ? chain.pcr.toFixed(2) : "—"}
          accent={chain ? (chain.pcr >= 1 ? "success" : "destructive") : undefined}
        />
        <Kpi label="Max Pain" value={chain ? n2(chain.maxPain, 0) : "—"} />
        <Kpi
          label="Total CE / PE OI"
          value={chain ? `${compact(chain.totalCallOi)} / ${compact(chain.totalPutOi)}` : "—"}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Radio
            className={`h-3 w-3 ${live ? "animate-pulse text-success" : "text-muted-foreground"}`}
          />
          {live ? `Live · auto-refresh ${REFRESH_MS / 1000}s` : "Reconnecting…"}
          <DataQualityBadges flags={chain} />
        </span>
        {chain && (
          <span suppressHydrationWarning>
            Updated {new Date(chain.generatedAt).toLocaleTimeString("en-IN")}
          </span>
        )}
      </div>

      <AiTradesPanel
        canSend={canSend}
        chain={chain}
        aiPlan={aiPlan}
        aiLoading={aiLoading}
        aiError={aiError}
        testSymbol={testSymbol}
        setTestSymbol={setTestSymbol}
        testLoading={testLoading}
        runAiTrades={runAiTrades}
        sendTestTrade={sendTestTrade}
      />

      <ComparePanel compareRows={compareRows} onClear={() => setCompare([])} />

      <ChainTable
        canSend={canSend}
        loading={loading}
        chain={chain}
        rows={rows}
        showCall={showCall}
        showPut={showPut}
        compare={compare}
        maxOi={maxOi}
        atmRef={atmRef}
        onToggleCompare={toggleCompare}
        onSendTrade={sendTrade}
      />
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-surface px-4 py-2.5 text-xs font-medium shadow-lg">
          <Send className="h-3.5 w-3.5 text-primary" /> {toast}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Data via Upstox Developer API (server-side only). Trade buttons dispatch Telegram alerts —
        they do not place live broker orders. Educational use only — not investment advice.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "success" | "destructive";
}) {
  const color =
    accent === "primary"
      ? "text-primary"
      : accent === "success"
        ? "text-success"
        : accent === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
