import { riskReport, type ReportOpts } from "../risk/report";
import type { Check, Level, RiskReport } from "../risk/types";

/** One check that has finished, while the rest of the report is still running. */
export type CheckDone = { id: Check["id"]; title: string; level: Level; summary: string };
/** The report so far: the checks that have landed. */
export type PendingReport = { pending: true; token: string; done: CheckDone[] };

/**
 * Runs a risk report and yields its progress: a pending state each time a check lands, then the
 * finished report. A cached report finishes at once, with no progress in between.
 */
export async function* reportProgress(token: string, opts: Omit<ReportOpts, "onCheck"> = {}): AsyncGenerator<PendingReport, RiskReport> {
  const done: CheckDone[] = [];
  let finished = false;
  let notify = () => {};
  let next = new Promise<void>((r) => (notify = r));
  const ping = () => {
    const n = notify;
    next = new Promise<void>((r) => (notify = r));
    n();
  };
  const run = riskReport(token, {
    ...opts,
    onCheck: (c) => {
      done.push({ id: c.id, title: c.title, level: c.level, summary: c.summary });
      ping();
    },
  }).finally(() => {
    finished = true;
    ping();
  });
  run.catch(() => {});

  yield { pending: true, token, done: [] };
  let sent = 0;
  for (;;) {
    if (done.length > sent) {
      sent = done.length;
      yield { pending: true, token, done: [...done] };
      continue;
    }
    if (finished) break;
    await next;
  }
  return run;
}
