import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchWithRetry, safeErrorMessage } from "./provider-utils";

const MAX_CSV_CHARS = 2_000_000;

// Read a public Google Sheet via the CSV export endpoint. Sheet must be
// shared as "Anyone with the link — viewer".
export const readPublicSheet = createServerFn({ method: "GET" })
  .validator((data) =>
    z
      .object({
        url: z.string().url().max(500),
        sheetName: z.string().trim().min(1).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const idMatch = data.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) return { ok: false as const, error: "Invalid sheet URL" };
    const id = idMatch[1];
    const sheetParam = data.sheetName ? `&sheet=${encodeURIComponent(data.sheetName)}` : "";
    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${sheetParam}`;
    try {
      const res = await fetchWithRetry(csvUrl, {}, { timeoutMs: 8000, retries: 1 });
      if (!res.ok)
        return { ok: false as const, error: `HTTP ${res.status} — is the sheet public?` };
      const text = (await res.text()).slice(0, MAX_CSV_CHARS);
      const rows = text
        .split(/\r?\n/)
        .filter((l) => l.length)
        .map((line) => {
          const out: string[] = [];
          let cur = "",
            inQ = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
              if (inQ && line[i + 1] === '"') {
                cur += '"';
                i++;
              } else inQ = !inQ;
            } else if (c === "," && !inQ) {
              out.push(cur);
              cur = "";
            } else cur += c;
          }
          out.push(cur);
          return out;
        });
      return { ok: true as const, rows };
    } catch (e) {
      return { ok: false as const, error: safeErrorMessage(e, "sheet fetch failed") };
    }
  });
