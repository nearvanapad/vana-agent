/**
 * The sticker button: an accent fill, a thick edge and a hard offset shadow it presses into.
 * Shape (radius, padding, text size) is left to the caller.
 */
export const STICKER =
  "flex items-center justify-center gap-1.5 border-2 border-edge bg-accent font-medium text-accent-ink shadow-sticker hover:bg-accent-hi active:translate-x-(--sh) active:translate-y-(--sh) active:shadow-none disabled:opacity-50 disabled:shadow-none";

/** The quiet button beside a sticker one: a hairline and muted text. */
export const QUIET = "flex items-center justify-center gap-1.5 border border-line text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50";

/** A small uppercase label over a group: "Today", "Waiting for your approval". */
export const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em]";
