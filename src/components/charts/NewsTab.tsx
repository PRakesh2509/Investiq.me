import { ExternalLink } from "lucide-react";
import type { News } from "./types";

export function NewsTab({ news }: { news: News | null }) {
  if (!news) return <p className="mt-6 text-center text-xs text-muted-foreground">Loading news…</p>;

  if (!news.ok || news.items.length === 0)
    return (
      <p className="mt-6 text-center text-xs text-muted-foreground">No recent news available.</p>
    );
  return (
    <ul className="mt-5 divide-y divide-border">
      {news.items.map(
        (
          n: { title: string; link: string; publisher: string; providerPublishTime: number },
          i: number,
        ) => (
          <li key={`${n.link}-${i}`} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <a
                href={n.link}
                target="_blank"
                rel="noreferrer"
                className="line-clamp-2 text-sm hover:text-primary"
              >
                {n.title}
              </a>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {n.publisher || "News"} ·{" "}
                {n.providerPublishTime
                  ? new Date(n.providerPublishTime).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </p>
            </div>
            <a
              href={n.link}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-border bg-background/50 p-1.5 hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
        ),
      )}
    </ul>
  );
}
