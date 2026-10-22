import { createFileRoute } from "@tanstack/react-router";
import { getLiveIpos } from "@/lib/ipos.functions";
import { researchIpo } from "@/lib/ipo-research.server";
import { formatResearchForTelegram, splitForTelegram } from "@/lib/ipo-research";
import type { IPO } from "@/lib/ipos";

const PERMANENT_CHAT_IDS = ["7350570004", "5589831995", "1840901163", "1360613728", "8155139346", "6799336293", "7280324188", "6698697147"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`TG(${chatId}): ${json.description ?? "unknown"}`);
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return NaN;
  const d = new Date(dateStr).getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d - now.getTime()) / 86_400_000);
}

function selectTargets(ipos: IPO[]): IPO[] {
  const interesting = ipos.filter((i) => {
    const dOpen = daysUntil(i.openDate);
    return i.status === "open" || dOpen === 0 || dOpen === 1 || (i.status === "upcoming" && dOpen > 0 && dOpen <= 21);
  });
  return (interesting.length ? interesting : ipos).slice(0, 6);
}

export const Route = createFileRoute("/api/public/hooks/ipo-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = process.env.TELEGRAM_BOT_TOKEN || "8945546681:AAGxUm2FdbVaXkg1x3oWJWB7wwSjcsCO-zc";
          if (!token) return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
          const live = await getLiveIpos();
          const IPOS = live.ipos;
          if (IPOS.length === 0) return Response.json({ ok: true, skipped: true, reason: "no IPOs" });

          // Dedup: only notify NEW IPOs. Force=true bypasses dedup (manual re-send).
          const body = (await request.json().catch(() => ({}))) as {
            force?: boolean;
            match?: string;
            all?: boolean;
            chatIds?: string[];
          };
          const force = !!body.force;
          const envIds = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const chatIds = body.chatIds?.length
            ? Array.from(new Set(body.chatIds.map((s) => String(s).trim()).filter(Boolean)))
            : Array.from(new Set([...PERMANENT_CHAT_IDS, ...envIds]));
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          let candidates = body.all ? IPOS : selectTargets(IPOS);
          if (body.match) {
            const q = body.match.toLowerCase();
            candidates = IPOS.filter((i) => i.company.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
          }
          let targets = candidates;
          if (!force) {
            const ids = candidates.map((i) => i.id);
            const { data: sent } = await supabaseAdmin
              .from("ipo_sent")
              .select("ipo_id")
              .in("ipo_id", ids);
            const seen = new Set((sent ?? []).map((r: any) => r.ipo_id));
            targets = candidates.filter((i) => !seen.has(i.id));
          }

          if (targets.length === 0) {
            return Response.json({ ok: true, skipped: true, reason: "no new IPOs", scanned: candidates.length });
          }

          let delivered = 0;
          const errors: string[] = [];
          for (const ipo of targets) {
            const research = await researchIpo(ipo);
            const parts = splitForTelegram(formatResearchForTelegram(research, ipo));
            for (const id of chatIds) {
              for (const part of parts) {
                try { await sendTelegram(token, id, part); delivered++; }
                catch (e) { errors.push((e as Error).message); }
                await sleep(400);
              }
            }
            if (!force) {
              await supabaseAdmin.from("ipo_sent").upsert({ ipo_id: ipo.id, company: ipo.company });
            }
            await sleep(1200);
          }
          return Response.json({ ok: delivered > 0, delivered, sent: targets.length, scanned: candidates.length, recipients: chatIds, errors });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
