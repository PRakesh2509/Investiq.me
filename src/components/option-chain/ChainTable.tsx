import type { RefObject } from "react";
import { ADMIN_REQUIRED_HINT } from "../adminFetch";
import { compact, n2, type Chain, type Row } from "./shared";

export function ChainTable({
  canSend,
  loading,
  chain,
  rows,
  showCall,
  showPut,
  compare,
  maxOi,
  atmRef,
  onToggleCompare,
  onSendTrade,
}: {
  canSend: boolean;
  loading: boolean;
  chain: Chain | null;
  rows: Row[];
  showCall: boolean;
  showPut: boolean;
  compare: number[];
  maxOi: number;
  atmRef: RefObject<HTMLTableRowElement | null>;
  onToggleCompare: (strike: number) => void;
  onSendTrade: (r: Row, type: "CE" | "PE", direction: "BUY" | "SELL") => void;
}) {
  return (
    <>
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
                {showCall && (
                  <th
                    colSpan={11}
                    className="border-b border-border px-2 py-2 text-center text-success"
                  >
                    Calls (CE)
                  </th>
                )}
                <th className="border-b border-x border-border px-2 py-2 text-center">Strike</th>
                {showPut && (
                  <th
                    colSpan={11}
                    className="border-b border-border px-2 py-2 text-center text-destructive"
                  >
                    Puts (PE)
                  </th>
                )}
              </tr>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {showCall &&
                  [
                    "OI",
                    "Chg OI",
                    "Vol",
                    "IV",
                    "Delta",
                    "Gamma",
                    "Theta",
                    "Vega",
                    "Bid/Ask",
                    "LTP",
                    "Trade",
                  ].map((h) => (
                    <th key={`c-${h}`} className="border-b border-border px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                <th className="border-b border-x border-border px-2 py-2 text-center font-medium">
                  Price
                </th>
                {showPut &&
                  [
                    "Trade",
                    "LTP",
                    "Bid/Ask",
                    "Vega",
                    "Theta",
                    "Gamma",
                    "Delta",
                    "IV",
                    "Vol",
                    "Chg OI",
                    "OI",
                  ].map((h) => (
                    <th key={`p-${h}`} className="border-b border-border px-2 py-2 font-medium">
                      {h}
                    </th>
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
                        <Td className={callItm ? "bg-success/5" : ""}>
                          {r.call.iv ? r.call.iv.toFixed(1) : "—"}
                        </Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.delta.toFixed(3)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.gamma.toFixed(4)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.theta.toFixed(2)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>{r.call.vega.toFixed(2)}</Td>
                        <Td className={callItm ? "bg-success/5" : ""}>
                          {n2(r.call.bid)} / {n2(r.call.ask)}
                        </Td>
                        <Td className={`font-semibold ${callItm ? "bg-success/5" : ""}`}>
                          {n2(r.call.ltp)}
                        </Td>
                        <TradeCell
                          disabled={!canSend}
                          onBuy={() => onSendTrade(r, "CE", "BUY")}
                          onSell={() => onSendTrade(r, "CE", "SELL")}
                        />
                      </>
                    )}

                    <td
                      className={`border-x border-border px-2 py-1.5 text-center font-semibold ${isAtm ? "text-primary" : ""}`}
                    >
                      <button
                        onClick={() => onToggleCompare(r.strike)}
                        title="Add to compare"
                        className={`rounded px-1 ${picked ? "text-primary" : "hover:text-primary"}`}
                      >
                        {n2(r.strike, 0)}
                      </button>
                      {isAtm && (
                        <span className="ml-1 rounded bg-primary/20 px-1 text-[9px] uppercase text-primary">
                          ATM
                        </span>
                      )}
                    </td>

                    {showPut && (
                      <>
                        <TradeCell
                          disabled={!canSend}
                          onBuy={() => onSendTrade(r, "PE", "BUY")}
                          onSell={() => onSendTrade(r, "PE", "SELL")}
                        />
                        <Td className={`font-semibold ${putItm ? "bg-destructive/5" : ""}`}>
                          {n2(r.put.ltp)}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {n2(r.put.bid)} / {n2(r.put.ask)}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {r.put.vega.toFixed(2)}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {r.put.theta.toFixed(2)}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {r.put.gamma.toFixed(4)}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {r.put.delta.toFixed(3)}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {r.put.iv ? r.put.iv.toFixed(1) : "—"}
                        </Td>
                        <Td className={putItm ? "bg-destructive/5" : ""}>
                          {compact(r.put.volume)}
                        </Td>
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
    </>
  );
}

function TradeCell({
  onBuy,
  onSell,
  disabled,
}: {
  onBuy: () => void;
  onSell: () => void;
  disabled: boolean;
}) {
  return (
    <td className="px-2 py-1.5">
      <div className="flex justify-end gap-1">
        <button
          onClick={onBuy}
          disabled={disabled}
          title={disabled ? ADMIN_REQUIRED_HINT : "Send BUY alert to Telegram"}
          aria-label="Send buy alert"
          className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold text-success hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          B
        </button>
        <button
          onClick={onSell}
          disabled={disabled}
          title={disabled ? ADMIN_REQUIRED_HINT : "Send SELL alert to Telegram"}
          aria-label="Send sell alert"
          className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40"
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
  const tone =
    value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <td className={`px-2 py-1.5 ${tone}`}>
      {value === 0 ? "—" : `${value > 0 ? "+" : ""}${compact(value)}`}
    </td>
  );
}

function OiCell({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "success" | "destructive";
}) {
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
