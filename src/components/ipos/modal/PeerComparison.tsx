import { Users } from "lucide-react";
import type { IPO } from "@/lib/ipos";

export function PeerComparison({ ipo }: { ipo: IPO }) {
  return (
    <>
      {ipo.peers && ipo.peers.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            Listed Peer Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/80 text-muted-foreground">
                  <th className="py-2">Company</th>
                  <th className="py-2">P/E Multiple</th>
                  <th className="py-2">Revenue (₹ Cr)</th>
                  <th className="py-2">PAT (₹ Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr className="bg-primary/5 font-semibold text-primary">
                  <td className="py-2">{ipo.company} (IPO)</td>
                  <td className="py-2">{ipo.postIssuePe ? `${ipo.postIssuePe}x` : "—"}</td>
                  <td className="py-2">
                    ₹{ipo.financials?.[ipo.financials.length - 1]?.revenueCr || "—"} Cr
                  </td>
                  <td className="py-2">
                    ₹{ipo.financials?.[ipo.financials.length - 1]?.patCr || "—"} Cr
                  </td>
                </tr>
                {ipo.peers.map((peer) => (
                  <tr key={peer.name}>
                    <td className="py-2 text-foreground">{peer.name}</td>
                    <td className="py-2 font-medium">{peer.pe ? `${peer.pe}x` : "—"}</td>
                    <td className="py-2 text-muted-foreground">₹{peer.revenueCr} Cr</td>
                    <td className="py-2 text-muted-foreground">₹{peer.patCr} Cr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
