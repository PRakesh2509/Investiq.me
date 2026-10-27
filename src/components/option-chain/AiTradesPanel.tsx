import { AlertTriangle, Send, Sparkles } from "lucide-react";
import type { AiTradePlan } from "@/lib/ai-trades";
import { ADMIN_REQUIRED_HINT } from "../adminFetch";
import { n2, type Chain } from "./shared";

export function AiTradesPanel({
  canSend,
  chain,
  aiPlan,
  aiLoading,
  aiError,
  testSymbol,
  setTestSymbol,
  testLoading,
  runAiTrades,
  sendTestTrade,
}: {
  canSend: boolean;
  chain: Chain | null;
  aiPlan: AiTradePlan | null;
  aiLoading: boolean;
  aiError: string | null;
  testSymbol: string;
  setTestSymbol: (s: string) => void;
  testLoading: boolean;
  runAiTrades: (notify: boolean) => void;
  sendTestTrade: () => void;
}) {
  return (
    <>
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
              disabled={aiLoading || !chain || !canSend}
              title={canSend ? undefined : ADMIN_REQUIRED_HINT}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-pulse" : ""}`} />
              {aiLoading ? "Analysing…" : "Generate"}
            </button>
            <button
              onClick={() => runAiTrades(true)}
              disabled={aiLoading || !chain || !canSend}
              title={canSend ? undefined : ADMIN_REQUIRED_HINT}
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
            disabled={testLoading || !canSend}
            title={canSend ? undefined : ADMIN_REQUIRED_HINT}
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
                  <div
                    key={`${t.rank}-${t.strike}-${t.optionType}`}
                    className="rounded-xl border border-border bg-surface/60 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {t.grade}
                      </span>
                      <span className="text-sm font-semibold">
                        {t.direction} {n2(t.strike, 0)} {t.optionType}
                      </span>
                      <span
                        className={`ml-auto text-[11px] font-semibold ${t.bias === "BULLISH" ? "text-success" : t.bias === "BEARISH" ? "text-destructive" : "text-muted-foreground"}`}
                      >
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
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Confidence {t.confidence}%
                    </div>
                    {t.rationale.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                        {t.rationale.slice(0, 3).map((r, i) => (
                          <li key={i}>• {r}</li>
                        ))}
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
    </>
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
