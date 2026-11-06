import { ExternalLink } from "lucide-react";
import type { SourceRef } from "@/lib/sources/http";

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Where the numbers came from, each linked, with the time it was read. */
export function Sources({ sources }: { sources: SourceRef[] }) {
  const seen = new Set<string>();
  const list = sources.filter((s) => s?.url && !seen.has(s.url) && seen.add(s.url));
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-2">
      {list.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 hover:text-accent-deep"
          title={`${s.url}\nread ${new Date(s.as_of).toLocaleString()}`}
        >
          {s.source} <span className="font-mono text-none">{time(s.as_of)}</span>
          <ExternalLink size={11} />
        </a>
      ))}
    </div>
  );
}
