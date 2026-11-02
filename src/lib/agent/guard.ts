/**
 * Prompt-injection guard. Token names, symbols and other text written by strangers reach the model
 * through tool results. Once any of it has been read in a request, tools that start an action
 * (a swap proposal) are switched off for the rest of that request, so injected text can't trigger
 * one. The user can still ask again in a new message, which starts a clean request.
 */

/** Tools that start something the user then approves in their wallet. */
export const ACTION_TOOLS: ReadonlySet<string> = new Set(["propose_swap"]);

export class Guard {
  /** Why action tools are off, or null while the request has read no stranger text. */
  tainted: string | null = null;

  taint(why: string) {
    this.tainted ??= why;
  }

  /** The tools the model may call in the next step. */
  active<T extends string>(names: T[]): T[] {
    return this.tainted ? names.filter((n) => !ACTION_TOOLS.has(n)) : names;
  }

  /** Throws when an action tool runs after stranger text was read (belt and braces with `active`). */
  assertAction(tool: string) {
    if (this.tainted) {
      throw new Error(`${tool} is blocked in this reply because it read ${this.tainted}. Ask the user to confirm in a new message.`);
    }
  }
}

/**
 * Stranger-written text, made safe to show and to hand to the model: one line, no control,
 * zero-width or direction-override characters, and short.
 */
export function stranger(text: unknown, max = 48): string {
  const s = String(text ?? "")
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
