import { ExternalLink } from "lucide-react";
import type { IPO } from "@/lib/ipos";

export function RegistrarFooter({ ipo }: { ipo: IPO }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
        <div>
          <p className="text-muted-foreground">Official Allotment Registrar:</p>
          <p className="font-semibold text-foreground">{ipo.registrar}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={ipo.allotmentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
          >
            Check Allotment on Registrar <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </>
  );
}
