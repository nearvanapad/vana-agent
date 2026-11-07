import { clsx } from "clsx";
import type { Level } from "@/lib/risk/types";

/** A level in words and a shape, so it never rests on colour alone. */
export const LEVEL: Record<Level, { word: string; icon: string; overall: string }> = {
  red: { word: "Red flag", icon: "✕", overall: "Red flags" },
  yellow: { word: "Watch", icon: "!", overall: "Things to watch" },
  green: { word: "No flag", icon: "✓", overall: "No red flags found" },
  not_checked: { word: "Not checked", icon: "?", overall: "Not checked" },
};

const MARK: Record<Level, string> = {
  red: "bg-bad text-on-level border-bad",
  yellow: "border-warn text-warn",
  green: "bg-ok/90 text-on-level border-ok",
  not_checked: "border-dashed border-(--none) text-none",
};

const PILL: Record<Level, string> = {
  red: "border-bad/60 text-bad",
  yellow: "border-warn/60 text-warn",
  green: "border-ok/60 text-ok",
  not_checked: "border-dashed border-(--none)/60 text-none",
};

/** The level's icon in a round chip: a cross, a bang, a tick or a question mark. */
export function Mark({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] text-[0.65rem] font-bold leading-none", MARK[level], className)}
    >
      {LEVEL[level].icon}
    </span>
  );
}

/** A small dot for a single finding. */
export function Dot({ level, className }: { level: Level; className?: string }) {
  const dot: Record<Level, string> = { red: "bg-bad", yellow: "bg-warn", green: "bg-ok", not_checked: "border border-(--none)" };
  return <span aria-hidden className={clsx("inline-block size-2 shrink-0 rounded-full", dot[level], className)} />;
}

/** The overall level as a pill: icon and words. */
export function LevelPill({ level, text }: { level: Level; text?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", PILL[level])}>
      <span aria-hidden>{LEVEL[level].icon}</span>
      {text ?? LEVEL[level].overall}
    </span>
  );
}

/** A check as one segment of a bar: its level's colour, the line colour when it didn't run. */
export const BAR: Record<Level, string> = { red: "bg-bad", yellow: "bg-warn", green: "bg-ok", not_checked: "bg-line" };
