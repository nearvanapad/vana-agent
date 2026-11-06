import { z } from "zod";

type Def = { inputSchema: z.ZodType; execute?: (input: unknown, opts: unknown) => unknown };

const isIterable = (v: unknown): v is AsyncIterable<unknown> => typeof v === "object" && v !== null && Symbol.asyncIterator in v;

/**
 * Runs one tool outside the chat: checks the arguments against its schema and returns its
 * output. A tool that streams progress is run to the end and only its last output is returned.
 */
export async function runTool(def: Def, args: unknown): Promise<{ ok: true; output: unknown } | { ok: false; error: string }> {
  const parsed = def.inputSchema.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, error: `Bad arguments: ${z.prettifyError(parsed.error)}` };
  try {
    const res = def.execute!(parsed.data, { toolCallId: crypto.randomUUID(), messages: [], abortSignal: AbortSignal.timeout(60_000) });
    if (isIterable(res)) {
      let last: unknown = null;
      for await (const v of res) last = v;
      return { ok: true, output: last };
    }
    return { ok: true, output: await res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
