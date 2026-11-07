import { clsx } from "clsx";
import { ArrowUpRight } from "lucide-react";
import { GATE_SYMBOL } from "@/lib/gate/config";

/** NEARVANA, the launchpad on NEAR testnet where NVANA was launched. */
export const NEARVANA_URL = "https://testnet.nearvana.trade/";

/** The NEARVANA mark: a pad with a token lifting off it, ink on a green tile. */
export function NearvanaMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[9px] border-2 border-edge bg-accent text-accent-ink shadow-sticker"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" width={size * 0.55} height={size * 0.55} fill="currentColor" className="block overflow-visible">
        <path fillRule="evenodd" d="M4.5 18.5H31V33H45.5V59.5H4.5ZM13.5 27.5H31V33H36.5V50.5H13.5Z" />
        <rect x="36" y="4" width="24" height="24" className="transition-transform duration-300 group-hover:translate-x-[3px] group-hover:-translate-y-[3px] motion-reduce:transition-none" />
      </svg>
    </span>
  );
}

/** A link out to the launchpad: its mark, its name and a line on what it is. Opens in a new tab. */
export function NearvanaLink({ blurb = "Our launchpad on testnet", className }: { blurb?: string; className?: string }) {
  return (
    <a
      href={NEARVANA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx("group flex items-center gap-3 rounded-well border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2", className)}
    >
      <NearvanaMark />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[15px] leading-tight tracking-[0.01em] text-text">NEARVANA</span>
        <span className="text-xs text-pretty text-text-2">{blurb}</span>
      </span>
      <ArrowUpRight size={16} className="shrink-0 text-text-2 group-hover:text-text" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** The blurb used where we introduce the launchpad at more length. */
export const NEARVANA_INTRO = `Launch and trade tokens on NEAR testnet. It's where ${GATE_SYMBOL} lives.`;
