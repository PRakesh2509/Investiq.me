import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { readPublicSheet } from "@/lib/sheets.functions";
import { Field } from "./shared";

type EtfRow = { name: string; rsi: number; price: string; change: string };

const colIndex = (letter: string) =>
  letter
    .toUpperCase()
    .split("")
    .reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0) - 1;

export function SheetsSection() {
  const { settings, updateSettings } = useAdmin();
  const readSheet = useServerFn(readPublicSheet);
  const [preview, setPreview] = useState<EtfRow[] | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const testRead = async () => {
    setLoading(true);
    try {
      const res = await readSheet({
        data: { url: settings.sheetUrl, sheetName: settings.sheetName },
      });
      if (!res.ok) {
        toast.error(`Sheet read failed: ${res.error}`);
        setPreview(null);
        return;
      }
      const rows = res.rows;
      if (rows.length < 2) {
        toast.error("Sheet has no data rows");
        return;
      }
      setHeaders(rows[0]);
      // Find the "Today Buy" cell; that section can sit to the right of the
      // main table (columns E–G in this sheet). Use its column as Rank,
      // +1 as RSI, +2 as ETF name/code — overriding the configured letters.
      let baseCol = -1;
      let startIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const idx = rows[i].findIndex((c) => (c ?? "").trim().toLowerCase() === "today buy");
        if (idx >= 0) {
          baseCol = idx;
          startIdx = i;
          break;
        }
      }
      const iPrice = baseCol >= 0 ? baseCol : colIndex(settings.colPrice);
      const iRSI = baseCol >= 0 ? baseCol + 1 : colIndex(settings.colRSI);
      const iName = baseCol >= 0 ? baseCol + 2 : colIndex(settings.colName);
      const scan = startIdx >= 0 ? rows.slice(startIdx + 1) : rows.slice(1);
      const data = scan
        .map((r) => ({
          name: (r[iName] ?? "").trim(),
          rsi: Number(r[iRSI]) || 0,
          price: r[iPrice] ?? "",
          change: "—",
        }))
        .filter((r) => r.name && r.rsi > 0 && /^(NSE|BSE):/i.test(r.name))
        .slice(0, 5);
      setPreview(data);
      toast.success(`Fetched ${data.length} rows from your sheet`);
    } catch (e) {
      toast.error(`Read failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-6">
      <h3 className="font-display text-lg font-semibold">Google Sheets Configuration</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Sheet must be shared as "Anyone with the link — Viewer".
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="Spreadsheet URL" wide>
          <input
            value={settings.sheetUrl}
            onChange={(e) => updateSettings({ sheetUrl: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Sheet name">
          <input
            value={settings.sheetName}
            onChange={(e) => updateSettings({ sheetName: e.target.value })}
            className="admin-input"
          />
        </Field>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Field label="Column: ETF name">
          <input
            value={settings.colName}
            onChange={(e) => updateSettings({ colName: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Column: RSI value">
          <input
            value={settings.colRSI}
            onChange={(e) => updateSettings({ colRSI: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Column: Price">
          <input
            value={settings.colPrice}
            onChange={(e) => updateSettings({ colPrice: e.target.value })}
            className="admin-input"
          />
        </Field>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-background/40 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Schedule</p>
        <p className="mt-1">
          Market open: 09:15 AM IST · RSI alert dispatch: 11:45 AM IST · Mon–Fri
        </p>
      </div>
      <div className="mt-5 flex gap-2">
        <button
          disabled={loading}
          onClick={testRead}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Reading…" : "Test read"}
        </button>
        <button
          onClick={() => toast.success("Configuration saved")}
          className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
        >
          Save configuration
        </button>
      </div>
      {headers && (
        <p className="mt-4 text-xs text-muted-foreground">
          Detected columns:{" "}
          {headers.map((h, i) => `${String.fromCharCode(65 + i)}=${h || "—"}`).join(" · ")}
        </p>
      )}
      {preview && preview.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Top 5 lowest RSI ETFs (from your sheet)
          </p>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ETF</th>
                <th>RSI</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((e) => (
                <tr key={e.name}>
                  <td className="font-medium">{e.name}</td>
                  <td>{e.rsi.toFixed(2)}</td>
                  <td>{e.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
