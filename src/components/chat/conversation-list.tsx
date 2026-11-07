"use client";

import { clsx } from "clsx";
import { Trash2 } from "lucide-react";
import { EYEBROW } from "@/components/ui/styles";

export type ConversationItem = { id: string; title: string; updated_at: number };

const DAY = 86_400_000;

/** Today, Yesterday, This week, This month, Earlier: by the last message, newest first. */
function grouped(items: ConversationItem[]): { label: string; items: ConversationItem[] }[] {
  const midnight = new Date().setHours(0, 0, 0, 0);
  const bucket = (t: number) => {
    // Seconds or milliseconds, whichever the store sends.
    const ms = t < 1e12 ? t * 1000 : t;
    if (ms >= midnight) return "Today";
    if (ms >= midnight - DAY) return "Yesterday";
    if (ms >= midnight - 6 * DAY) return "This week";
    if (ms >= midnight - 29 * DAY) return "This month";
    return "Earlier";
  };
  const out: { label: string; items: ConversationItem[] }[] = [];
  for (const c of [...items].sort((a, b) => b.updated_at - a.updated_at)) {
    const label = bucket(c.updated_at);
    const g = out.at(-1);
    if (g?.label === label) g.items.push(c);
    else out.push({ label, items: [c] });
  }
  return out;
}

export function ConversationList(props: { items: ConversationItem[]; active: string; onPick: (id: string) => void; onDelete: (id: string) => void; signedIn: boolean }) {
  const groups = grouped(props.items);
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-2 pb-3" aria-label="Conversations">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <div className={clsx(EYEBROW, "px-2.5 py-1 text-text-2/75")}>{g.label}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => props.onPick(c.id)}
                  aria-current={c.id === props.active ? "page" : undefined}
                  title={c.title}
                  className={clsx(
                    "block w-full truncate rounded-[10px] px-2.5 py-2 pr-8 text-left text-sm",
                    c.id === props.active ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => props.onDelete(c.id)}
                  aria-label={`Delete “${c.title}”`}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-text-2 opacity-0 group-hover:opacity-100 hover:text-bad focus:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {props.items.length === 0 && <p className="px-2.5 py-2 text-xs text-text-2">{props.signedIn ? "No chats yet." : "Your chats show here once you sign in."}</p>}
    </nav>
  );
}
