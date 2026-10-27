import { createFileRoute } from "@tanstack/react-router";
import { getLiveIpos } from "@/lib/ipos.functions";
import { researchIpo } from "@/lib/ipo-research.server";
import { formatResearchForTelegram } from "@/lib/ipo-research";
import type { IPO } from "@/lib/ipos";
import { hookFailure, hookResponse, readJsonBody, requireCronAuth } from "@/lib/cron-auth.server";
import { getBotToken, resolveChatIds, sendToMany } from "@/lib/telegram.server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function daysUntil(dateStr: string): number {
  if (!dateStr) return NaN;
  const d = new Date(dateStr).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now.getTime()) / 86_400_000);
}

function selectTargets(ipos: IPO[]): IPO[] {
  const interesting = ipos.filter((i) => {
    const dOpen = daysUntil(i.openDate);
    return (
      i.status === "open" ||
      dOpen === 0 ||
      dOpen === 1 ||
      (i.status === "upcoming" && dOpen > 0 && dOpen <= 21)
    );
  });
  return (interesting.length ? interesting : ipos).slice(0, 6);
}

export const Route = createFileRoute("/api/public/hooks/ipo-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireCronAuth(request);
        if (denied) return denied;
        try {
          const token = getBotToken();
          if (!token) return hookFailure("TELEGRAM_BOT_TOKEN not configured", 503);

          const live = await getLiveIpos();
          const IPOS = live.ipos;
          if (IPOS.length === 0) {
            return hookResponse({ sent: 0, skipped: 1, errors: [], reason: "no IPOs" });
          }

          // Dedup: only notify NEW IPOs. Force=true bypasses dedup (manual re-send).
          const body = await readJsonBody<{
            force: boolean;
            match: string;
            all: boolean;
            chatIds: string[];
          }>(request);
          const force = !!body.force;
          const chatIds = resolveChatIds(body.chatIds);
          const { alreadySent, claimOnce, releaseClaim } = await import("@/lib/hook-dedupe.server");

          let candidates = body.all ? IPOS : selectTargets(IPOS);
          if (typeof body.match === "string" && body.match) {
            const q = body.match.toLowerCase();
            candidates = IPOS.filter(
              (i) => i.company.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
            );
          }

          // Cheap read-side pre-filter; the insert-first claim below is what makes it race-safe.
          let targets = candidates;
          if (!force) {
            const seen = await alreadySent(
              "ipo_sent",
              "ipo_id",
              candidates.map((i) => i.id),
            );
            targets = candidates.filter((i) => !seen.has(i.id));
          }

          if (targets.length === 0) {
            return hookResponse({
              sent: 0,
              skipped: candidates.length,
              errors: [],
              reason: "no new IPOs",
              scanned: candidates.length,
            });
          }

          let sent = 0;
          let skipped = candidates.length - targets.length;
          let processed = 0;
          let dedupeUnavailable = false;
          const errors: string[] = [];
          for (const ipo of targets) {
            let claimed = false;
            try {
              if (!force) {
                const claim = await claimOnce(
                  "ipo_sent",
                  { ipo_id: ipo.id, company: ipo.company },
                  ipo.id,
                );
                if (claim === "duplicate") {
                  skipped++;
                  continue;
                }
                if (claim === "unavailable") dedupeUnavailable = true;
                else claimed = true;
              }
              const research = await researchIpo(ipo);
              const text = formatResearchForTelegram(research, ipo);
              const res = await sendToMany(token, chatIds, text, { delayMs: 400 });
              sent += res.delivered;
              errors.push(...res.errors);
              processed++;
              if (res.delivered === 0 && claimed) {
                await releaseClaim("ipo_sent", { ipo_id: ipo.id }, ipo.id);
              }
            } catch (e) {
              errors.push(`${ipo.company}: ${(e as Error).message}`);
              if (claimed) await releaseClaim("ipo_sent", { ipo_id: ipo.id }, ipo.id);
            }
            await sleep(1200);
          }
          return hookResponse({
            sent,
            skipped,
            errors,
            delivered: sent,
            processed,
            scanned: candidates.length,
            recipients: chatIds.length,
            dedupe: dedupeUnavailable ? "unavailable" : "ok",
          });
        } catch (e) {
          console.error("[ipo-alert]", (e as Error).message);
          return hookFailure((e as Error).message);
        }
      },
    },
  },
});
