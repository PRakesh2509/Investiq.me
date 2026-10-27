import { createFileRoute } from "@tanstack/react-router";
import { tradeCandidateService } from "@/lib/services/tradeCandidateService";
import {
  badRequest,
  okJson,
  parseInstrumentParam,
  parseNumberParam,
  serverError,
} from "@/lib/services/fnoApiHelpers";

export const Route = createFileRoute("/api/fno/candidate-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const rawInstrument = url.searchParams.get("instrument");
          let instrument: string | undefined;
          if (rawInstrument !== null && rawInstrument.trim() !== "") {
            const inst = parseInstrumentParam(rawInstrument);
            if (!inst.ok) return badRequest(inst.error);
            instrument = inst.value;
          }
          const limit = parseNumberParam(url.searchParams.get("limit"), "limit", {
            defaultValue: 50,
            min: 1,
            max: 200,
          });
          if (!limit.ok) return badRequest(limit.error);

          // Read-only view of the candidate lifecycle log. This never evaluates synthetic
          // market data: history only contains candidates produced from verified inputs by
          // this isolate. On Workers, isolate memory is ephemeral, so the log may be empty.
          return okJson({
            ok: true,
            history: tradeCandidateService.getHistory(Math.floor(limit.value), instrument),
            active: tradeCandidateService.getActiveCandidates(instrument),
            note: "In-memory per-isolate log; not durable across isolates or restarts.",
          });
        } catch (e) {
          return serverError("api/fno/candidate-history", e);
        }
      },
    },
  },
});
