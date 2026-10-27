import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, Clock, Globe, Layers, RefreshCw, Send, Zap } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import {
  getMarketTiming,
  type HighProfitTradeSetup,
  type MacroBackdrop,
  type SetupStatus,
  type TradeMarket,
} from "@/lib/trade-analysis";
import { DEFAULT_LOVABLE_ENDPOINT } from "./admin-constants";
import { useMarketSetups, type MarketSetupsView } from "./useMarketSetups";
import type { LiveActionType } from "./useApiKeyTester";

interface SetupProps {
  testingEndpoint: LiveActionType | null;
  onDispatch?: (type: LiveActionType) => void;
}

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : String(v));

const ACCENT = {
  emerald: {
    pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    card: "border-border/80 hover:border-emerald-500/40",
    badge: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400",
    text: "text-emerald-400",
    textSoft: "text-emerald-300",
    button: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
    icon: "text-primary",
  },
  cyan: {
    pill: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
    card: "border-cyan-500/30 hover:border-cyan-500/50",
    badge: "bg-cyan-500/15 border border-cyan-500/30 text-cyan-400",
    text: "text-cyan-400",
    textSoft: "text-cyan-300",
    button: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25",
    icon: "text-cyan-400",
  },
} as const;

type Accent = keyof typeof ACCENT;

const STATUS_LABEL: Record<SetupStatus, string> = {
  SETUP_AVAILABLE: "Setup available",
  NO_TRADE: "No trade",
  MARKET_CLOSED: "Market closed",
  DATA_UNAVAILABLE: "Data unavailable",
  DATA_SIMULATED: "Only simulated data",
  DATA_STALE: "Data stale",
  DATA_DELAYED: "Data delayed",
};

/** Clear empty / unavailable state: why there is no setup and which inputs were checked. */
function NoSetupPanel({
  data,
  error,
  loading,
}: {
  data: MarketSetupsView | null;
  error: string | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/40 p-5 text-xs text-muted-foreground">
        Deriving setups from live market data…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
        Could not load setups: {error ?? "unknown error"}
      </div>
    );
  }
  const q = data.dataQuality;
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <strong className="text-sm text-foreground">No trade setup right now</strong>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
          {data.status ? (STATUS_LABEL[data.status] ?? data.status) : "Unavailable"}
        </span>
      </div>
      <p className="leading-relaxed text-muted-foreground">
        {data.reason ?? error ?? "No reason was reported."} Setups are only shown when they can be
        derived from a live, non-simulated option chain, real candles and an open session; nothing
        is shown as a placeholder.
      </p>
      {data.perInstrument && data.perInstrument.length > 0 && (
        <ul className="space-y-1">
          {data.perInstrument.map((p) => (
            <li key={p.instrument} className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">{p.instrument}</strong> ·{" "}
              {STATUS_LABEL[p.status] ?? p.status}: {p.reason}
            </li>
          ))}
        </ul>
      )}
      {q && (
        <p className="font-mono text-[11px] text-muted-foreground">
          chain: {q.chain} · greeks: {q.greeks} · technicals: {q.technicals} · candles:{" "}
          {q.candles?.source ?? "n/a"} · macro: {q.macro}
        </p>
      )}
    </div>
  );
}

function SetupCard({
  t,
  accent,
  sending,
  onSend,
  sendLabel,
}: {
  t: HighProfitTradeSetup;
  accent: Accent;
  sending: boolean;
  onSend: () => void;
  sendLabel: string;
}) {
  const a = ACCENT[accent];
  const isPut = t.optionType === "PE" || t.optionType === "PUT";
  const ct = t.chartTechnicals;
  const g = t.greeks;
  return (
    <div
      className={`rounded-xl border bg-background/60 p-5 shadow-md transition space-y-3.5 ${a.card}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-bold text-foreground">{t.symbol}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-extrabold ${
                isPut
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {t.contract}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground font-medium">{t.strategy}</p>
        </div>
        <div className="text-right">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${a.badge}`}>
            R:R {t.riskRewardRatio}
          </span>
          <p className={`mt-1 text-[11px] font-semibold ${a.text}`}>
            {t.expectedProfitPctT2} if Target 2 is hit
          </p>
        </div>
      </div>

      {/* Price targets grid */}
      <div className="grid grid-cols-5 gap-2 rounded-lg border border-border/60 bg-background/80 p-2.5 text-center text-xs">
        <div>
          <span className="text-[10px] uppercase text-muted-foreground block">Entry (ask)</span>
          <strong className="text-foreground">
            {t.currency}
            {t.entryPrice}
          </strong>
        </div>
        <div>
          <span className="text-[10px] uppercase text-rose-400 block">Stop Loss</span>
          <strong className="text-rose-400">
            {t.currency}
            {t.stopLossPrice}
          </strong>
        </div>
        <div>
          <span className={`text-[10px] uppercase block ${a.text}`}>Target 1</span>
          <strong className={a.text}>
            {t.currency}
            {t.target1}
          </strong>
        </div>
        <div>
          <span className={`text-[10px] uppercase block ${a.textSoft}`}>Target 2</span>
          <strong className={a.textSoft}>
            {t.currency}
            {t.target2}
          </strong>
        </div>
        <div>
          <span className={`text-[10px] uppercase block ${a.textSoft}`}>Target 3</span>
          <strong className={a.textSoft}>
            {t.currency}
            {t.target3}
          </strong>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="rounded-lg border border-border/40 bg-surface/50 p-2.5 space-y-1">
          <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
            <Layers className={`h-3 w-3 ${a.icon}`} /> Chart Technicals ({ct?.timeframe ?? "n/a"}):
          </span>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {ct?.keyObservation ?? "n/a"} Structure: {ct?.chartPattern ?? "n/a"}. S/R:{" "}
            {fmt(ct?.support1)} / {fmt(ct?.resistance1)}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-border/40 bg-surface/40 p-2 space-y-0.5">
            <span className="font-medium text-muted-foreground block">Option Greeks (net):</span>
            <p className="text-foreground">
              Delta: <strong>{fmt(t.calculation?.netDelta)}</strong> · Gamma:{" "}
              <strong>{fmt(g?.gamma)}</strong>
            </p>
            <p className="text-muted-foreground">
              Theta: <strong>{fmt(g?.thetaPerDay)}/day</strong> · PCR (OI):{" "}
              <strong className={a.text}>{fmt(g?.pcrOpenInterest)}</strong>
            </p>
          </div>

          <div className="rounded-lg border border-border/40 bg-surface/40 p-2 space-y-0.5">
            <span className="font-medium text-muted-foreground block">Macro quotes:</span>
            <p className="text-muted-foreground line-clamp-3">
              {t.geopolitics?.available
                ? t.geopolitics.summary
                : "Macro quotes unavailable (not inferred)."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
        <span className="text-[11px] text-muted-foreground">
          Timing: <strong>{t.timing?.executionWindow ?? "n/a"}</strong>
          {t.generatedAt && <> · generated {new Date(t.generatedAt).toLocaleTimeString()}</>}
          <br />
          Source: {t.dataSource ?? "n/a"} · paper order only
        </span>
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition shadow-sm disabled:opacity-50 ${a.button}`}
        >
          <Send className="h-3 w-3" /> {sendLabel}
        </button>
      </div>
    </div>
  );
}

/** Pushes one derived setup to the configured paper-trading endpoint (admin session, paper only). */
function useDispatchSetup(market: TradeMarket) {
  const { settings } = useAdmin();
  const [sendingSymbol, setSendingSymbol] = useState<string | null>(null);

  const dispatch = useCallback(
    async (symbol: string) => {
      setSendingSymbol(symbol);
      try {
        const res = await fetch("/api/v1/trades/dispatch-external", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market,
            symbol,
            targetUrl: settings.externalTradingEndpoint || DEFAULT_LOVABLE_ENDPOINT,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          reason?: string;
          error?: string;
          result?: { dispatchedContract?: string; httpStatus?: number | null };
        };
        if (json.ok) {
          toast.success(`Pushed ${json.result?.dispatchedContract ?? symbol} (paper order)`);
        } else {
          toast.error(json.reason ?? json.error ?? `Dispatch failed (${res.status})`);
        }
      } catch (e) {
        toast.error(`Dispatch failed: ${(e as Error)?.message ?? "network error"}`);
      } finally {
        setSendingSymbol(null);
      }
    },
    [market, settings.externalTradingEndpoint],
  );

  return { sendingSymbol, dispatch };
}

/** 1. Indian NSE F&O setups derived from live data */
export function IndianTradeSetups({ testingEndpoint }: SetupProps) {
  const { data, loading, error, refresh } = useMarketSetups("NSE_FNO");
  const { sendingSymbol, dispatch } = useDispatchSetup("NSE_FNO");
  const timing = data?.marketTiming ?? getMarketTiming("NSE_FNO");
  const setups = data?.setups ?? [];
  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${ACCENT.emerald.pill}`}
          >
            <Activity className="h-3.5 w-3.5" /> Indian Market Setups (1st Key • NSE F&amp;O)
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {timing.regularHoursIST}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <span className="rounded-full border border-border bg-background/50 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
          {timing.statusText}
        </span>
      </div>

      {setups.length === 0 ? (
        <NoSetupPanel data={data} error={error} loading={loading} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {setups.map((t) => (
            <SetupCard
              key={t.tradeId}
              t={t}
              accent="emerald"
              sending={sendingSymbol === t.symbol || Boolean(testingEndpoint?.includes("DISPATCH"))}
              onSend={() => void dispatch(t.symbol)}
              sendLabel="Push this setup (paper)"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 2. US Market setups derived from live data */
export function GlobalTradeSetups({ testingEndpoint }: SetupProps) {
  const { data, loading, error, refresh } = useMarketSetups("GLOBAL_US");
  const { sendingSymbol, dispatch } = useDispatchSetup("GLOBAL_US");
  const timing = data?.marketTiming ?? getMarketTiming("GLOBAL_US");
  const setups = data?.setups ?? [];
  const macro: MacroBackdrop | undefined = setups[0]?.geopolitics;
  return (
    <div className="space-y-3 pt-4 border-t border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${ACCENT.cyan.pill}`}
          >
            <Globe className="h-3.5 w-3.5" /> US &amp; Global Market Setups (2nd Key • GLOBAL)
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {timing.regularHoursIST} ({timing.regularHoursLocal})
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full bg-cyan-400 ${timing.isMarketClosed ? "" : "animate-pulse"}`}
          ></span>
          {timing.statusText}
        </span>
      </div>

      {macro?.available && (
        <p className="text-[11px] text-muted-foreground">
          <Zap className="mr-1 inline h-3 w-3 text-cyan-400" />
          {macro.summary}
        </p>
      )}

      {setups.length === 0 ? (
        <NoSetupPanel data={data} error={error} loading={loading} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {setups.map((t) => (
            <SetupCard
              key={t.tradeId}
              t={t}
              accent="cyan"
              sending={sendingSymbol === t.symbol || Boolean(testingEndpoint?.includes("DISPATCH"))}
              onSend={() => void dispatch(t.symbol)}
              sendLabel="Push this setup (paper)"
            />
          ))}
        </div>
      )}
    </div>
  );
}
