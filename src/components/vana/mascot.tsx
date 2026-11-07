"use client";

import { clsx } from "clsx";
import { useEffect, useId, useRef } from "react";
import { VanaArt } from "./art";

export type Mood = "idle" | "thinking" | "speaking" | "happy" | "alert";

/** Moods where the eyes are free to follow the pointer; the others hold their own gaze. */
const TRACKS: Mood[] = ["idle", "speaking", "alert"];

/**
 * Vana, drawn as an animated SVG. The mood sets the face and the pace; with `track`, the eyes
 * follow the pointer while the mood allows it. Decorative unless given a `label`.
 */
export function Mascot({ mood = "idle", size, track = false, label, className }: { mood?: Mood; size: number; track?: boolean; label?: string; className?: string }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glow = `vana-glow-${raw}`;
  const card = `vana-card-${raw}`;
  const ref = useRef<SVGSVGElement>(null);
  const follow = track && TRACKS.includes(mood);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const pupils = svg.querySelectorAll<SVGGElement>(".v-pupil");
    if (!follow) {
      pupils.forEach((p) => (p.style.transform = ""));
      return;
    }
    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width * 0.5);
      const dy = e.clientY - (r.top + r.height * 0.52);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / (r.width * 1.5));
      const t = `translate(${((dx / d) * 1.1 * k).toFixed(2)}px,${((dy / d) * 0.9 * k).toFixed(2)}px)`;
      pupils.forEach((p) => (p.style.transform = t));
    };
    addEventListener("pointermove", onMove);
    return () => removeEventListener("pointermove", onMove);
  }, [follow]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={clsx("vana block shrink-0", `mood-${mood}`, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <VanaArt glow={glow} card={card} />
    </svg>
  );
}
