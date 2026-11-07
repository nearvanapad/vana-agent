import { byLevel } from "../risk/rules";
import type { Level } from "../risk/types";

/** What a swap shows from a token check of the token bought: the overall level and what was flagged, worst first. */
export type SwapRisk = {
  token: string;
  level: Level;
  flags: { title: string; level: Level; summary: string }[];
  /** When the check ran. */
  as_of: string;
};

/** Boils a token check (the full report, or the view the pane holds) down to what the swap card shows. */
export function swapRisk(r: { token: string; level: Level; as_of: string; checks: { title: string; level: Level; summary: string }[] }): SwapRisk {
  const flags = r.checks
    .filter((c) => c.level === "red" || c.level === "yellow")
    .sort(byLevel)
    .map(({ title, level, summary }) => ({ title, level, summary }));
  return { token: r.token, level: r.level, flags, as_of: r.as_of };
}
