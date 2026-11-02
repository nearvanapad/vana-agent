import { clsx } from "clsx";
import type { Level } from "@/lib/risk/types";

export const LEVEL_LABEL: Record<Level, string> = {
  red: "Red flags",
  yellow: "Caution",
  green: "No flags",
  not_checked: "Not checked",
};

const DOT: Record<Level, string> = { red: "bg-bad", yellow: "bg-warn", green: "bg-ok", not_checked: "border border-none" };
const PILL: Record<Level, string> = {
  red: "border-bad/50 text-bad",
  yellow: "border-warn/50 text-warn",
  green: "border-ok/50 text-ok",
  not_checked: "border-none/50 text-none",
};

export function Dot({ level, className }: { level: Level; className?: string }) {
  return <span aria-hidden className={clsx("inline-block size-2.5 shrink-0 rounded-full", DOT[level], className)} />;
}

export function LevelPill({ level }: { level: Level }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", PILL[level])}>
      <Dot level={level} className="size-2" />
      {LEVEL_LABEL[level]}
    </span>
  );
}
