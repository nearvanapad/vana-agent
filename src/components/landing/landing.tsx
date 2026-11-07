"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ShieldCheck, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { QUIET, STICKER } from "@/components/ui/styles";
import { Mascot, type Mood } from "@/components/vana/mascot";
import { GATE_MIN, GATE_SYMBOL } from "@/lib/gate/config";
import vana from "../chat/vana.gif";

/*
 * The landing page: seven chapters, each a tall section with a sticky stage. Scrolling through a
 * chapter scrubs its demo (typing, checks landing, links drawn, the wallet signing), and Vana flies
 * from chapter to chapter, changing mood as the story goes.
 */

type Level = "yellow" | "green" | "not_checked";

const CHECKS: { title: string; level: Level; summary: string; about: string; sources: string[] }[] = [
  {
    title: "Contract",
    level: "yellow",
    summary: "The owner account can upgrade the contract. No full-access keys on the token account.",
    about: "Who can change the token: keys on its account, an owner, and methods that mint, upgrade, pause or set fees.",
    sources: ["NEAR RPC", "NearBlocks"],
  },
  {
    title: "Holders",
    level: "yellow",
    summary: "Top 10 wallets hold 61.4% outside pools, lockers and burns.",
    about: "How much the largest holders have, leaving out pools, lockers and burns, and how much sits with the dev.",
    sources: ["FastNEAR API", "NearBlocks"],
  },
  {
    title: "Early buyers",
    level: "green",
    summary: "No linked wallets among the first 50 buyers.",
    about: "The first wallets to buy after the pool opened, and whether they are tied to the dev or each other.",
    sources: ["NearBlocks"],
  },
  {
    title: "Fresh wallets",
    level: "green",
    summary: "No large holder is under a week old.",
    about: "Large holders whose wallet was created less than a week ago.",
    sources: ["NearBlocks"],
  },
  {
    title: "Liquidity",
    level: "green",
    summary: "$412.6k across 3 Rhea pools. No single account can pull it.",
    about: "How deep the Rhea pools are in dollars, and whether whoever added the liquidity can pull it.",
    sources: ["Rhea"],
  },
  { title: "Taxes", level: "green", summary: "No buy or sell tax.", about: "Buy and sell tax set by the token, its pool or its launchpad.", sources: ["NEAR RPC", "Rhea"] },
  {
    title: "Creator history",
    level: "not_checked",
    summary: "Not launched on a tracked launchpad.",
    about: "Other tokens the creator launched on the tracked launchpads, and how each ended.",
    sources: ["Launchpads"],
  },
];

const LV: Record<Level, { word: string; icon: string; mark: string; word_: string; bar: string }> = {
  yellow: { word: "Watch", icon: "!", mark: "border-solid border-warn text-warn", word_: "text-warn", bar: "bg-warn" },
  green: { word: "No flag", icon: "✓", mark: "border-solid border-ok bg-ok text-on-level", word_: "text-text-2", bar: "bg-ok" },
  not_checked: { word: "Not checked", icon: "?", mark: "border-dashed border-(--none) text-none", word_: "text-none", bar: "bg-(--off)" },
};

/** The first twelve buyers, round the dev; some tie back to it. */
const RING = [
  [50, 10],
  [70, 15.4],
  [84.6, 30],
  [90, 50],
  [84.6, 70],
  [70, 84.6],
  [50, 90],
  [30, 84.6],
  [15.4, 70],
  [10, 50],
  [15.4, 30],
  [30, 15.4],
] as const;
const LABELS = ["k7d2…a91", "3f0c…e12", "buyer.near", "9a41…c07", "m00n.near", "b77e…19f", "ape22.near", "c3d8…4b0", "e5a1…77d", "fren.near", "b1.vanarug…", "0d9f…a3c"];
/** Buyer index → the step it lights up at, and why it is linked. */
const LINKS: Record<number, [number, string]> = { 1: [1, "same funder"], 5: [1, "same funder"], 8: [1, "same funder"], 10: [2, "sub-account"], 6: [3, "coins passed"] };

const RAIL = ["Start", "Ask", "Check", "Early buyers", "Answer", "Swap", "Access"];
/** Each chapter's height, in screen heights: how long its demo takes to scroll through. */
const HEIGHTS = [190, 300, 380, 320, 300, 320, 280];
const ASK = "Is SWEAT safe?";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const steps = (p: number, at: number[]) => at.filter((x) => p >= x).length;

type Scrub = { active: number; askChars: number; ask: number; check: number; links: number; report: number; swap: number; gate: number };
const START: Scrub = { active: 0, askChars: 0, ask: 0, check: 0, links: 0, report: 0, swap: 0, gate: 0 };

function moodOf(n: Scrub): Mood {
  return (
    [
      "idle",
      n.ask >= 1 ? "thinking" : "idle",
      n.check >= 7 ? "speaking" : "thinking",
      n.links >= 1 ? "alert" : "thinking",
      "speaking",
      n.swap >= 4 ? "happy" : "speaking",
      n.gate >= 4 ? "happy" : "idle",
    ] as const
  )[n.active] ?? "idle";
}

/** Hidden until `on`, then it rises into place. */
function Reveal({ on, delay = 0, rise = 14, className, children }: { on: boolean; delay?: number; rise?: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx("transition-[opacity,transform] duration-[400ms]", className)}
      style={{ opacity: on ? 1 : 0, transform: on ? "none" : `translateY(${rise}px)`, transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function Spin() {
  return <span className="block size-3 shrink-0 animate-spin rounded-full border-2 border-accent border-r-transparent" aria-hidden />;
}

/** Splits text into words that rise (a heading) or fade in (copy), one after another from `from` seconds. */
function words(text: string, from: number, step: number, head: boolean): ReactNode[] {
  let n = 0;
  return text.split(/(\s+)/).map((part, i) => {
    if (!part || /^\s+$/.test(part)) return part;
    const d = { "--d": `${(from + n++ * step).toFixed(2)}s` } as CSSProperties;
    return head ? (
      <span key={i} className="wm">
        <span className="wi" style={d}>
          {part}
        </span>
      </span>
    ) : (
      <span key={i} className="w" style={d}>
        {part}
      </span>
    );
  });
}

const count = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** A chapter's heading, copy and progress bar, timed as one sequence. */
function Intro({ title, body, hero }: { title: string; body: string; hero?: boolean }) {
  const afterTitle = count(title) * 0.08 + 0.2;
  const afterBody = afterTitle + count(body) * 0.03 + 0.1;
  const Title = hero ? "h1" : "h2";
  return (
    <>
      <Title
        data-split
        className={clsx(
          "tx m-0 font-display font-normal text-balance",
          hero ? "text-[clamp(30px,6vw,80px)] leading-[1.02] tracking-[0.01em]" : "text-[clamp(22px,3.8vw,50px)] leading-[1.05]",
        )}
      >
        {words(title, 0, 0.08, true)}
      </Title>
      <p data-split className={clsx("tx m-0 text-[clamp(14px,calc(0.6vw+11.5px),17px)] text-pretty text-text-2", hero && "max-w-[560px]")}>
        {words(body, afterTitle, 0.03, false)}
      </p>
      {!hero && (
        <div className="tx h-[3px] w-[140px] overflow-hidden rounded-full bg-surface-2" style={{ "--d": `${afterBody.toFixed(2)}s` } as CSSProperties}>
          <div className="h-full origin-left bg-accent" style={{ transform: "scaleX(var(--p))" }} />
        </div>
      )}
    </>
  );
}

const CARD = "rounded-[20px] border border-line bg-surface shadow-[0_30px_60px_rgb(0_0_0/0.35)]";
const PILL_WATCH = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/60 px-2.5 py-0.5 text-xs font-semibold text-warn";

/** A chapter: the copy on one side with a slot Vana lands in, the demo on the other. */
function Chapter({
  index,
  label,
  secRef,
  phRef,
  title,
  body,
  demoClass,
  children,
}: {
  index: number;
  label: string;
  secRef: (el: HTMLElement | null) => void;
  phRef: (el: HTMLDivElement | null) => void;
  title: string;
  body: string;
  demoClass?: string;
  children: ReactNode;
}) {
  return (
    <section ref={secRef} id={label} aria-label={RAIL[index]} className="relative" style={{ height: `${HEIGHTS[index]}vh`, "--p": 0, "--pp": 0.5 } as CSSProperties}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden py-16">
        <div
          data-fit="full"
          className="relative mx-auto grid w-full max-w-[1520px] origin-center grid-cols-[repeat(auto-fit,minmax(min(100%,370px),1fr))] items-center gap-x-10 gap-y-7 px-[4vw] py-3"
        >
          <div className="flex items-center gap-[clamp(16px,2.5vw,32px)]">
            <div ref={phRef} className="min-h-[88px] flex-[0_0_clamp(88px,15vw,240px)] self-stretch" />
            <div className="flex max-w-[440px] min-w-0 flex-1 flex-col gap-3.5">
              <Intro title={title} body={body} />
            </div>
          </div>
          <div className={clsx("w-full justify-self-center", demoClass ?? "max-w-[560px]")} style={{ transform: "translateY(calc((0.5 - var(--pp)) * 80px))" }}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  const [s, setS] = useState<Scrub>(START);
  const [wide, setWide] = useState(true);
  const secs = useRef<(HTMLElement | null)[]>([]);
  const phs = useRef<(HTMLDivElement | null)[]>([]);
  const flyer = useRef<HTMLDivElement>(null);
  const stateRef = useRef(s);
  stateRef.current = s;

  useEffect(() => {
    const onResize = () => setWide(innerWidth >= 1000);
    onResize();
    addEventListener("resize", onResize);
    let heroIn = false;
    const heroT = setTimeout(() => (heroIn = true), 300);
    let cur: { x: number; y: number; w: number } | null = null;
    let fits: HTMLElement[] = [];
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const vh = innerHeight;
      const ps = secs.current.map((el, i) => {
        if (!el) return { p: 0, top: 1e9 };
        const b = el.getBoundingClientRect();
        const span = b.height - vh;
        const p = span > 0 ? clamp(-b.top / span) : 0;
        el.style.setProperty("--p", p.toFixed(4));
        el.style.setProperty("--pp", p.toFixed(4));
        const shown = (i === 0 ? heroIn : b.top < vh * 0.6) ? "1" : "0";
        if (el.dataset.in !== shown) el.dataset.in = shown;
        return { p, top: b.top };
      });

      // Scale each stage down until it fits the screen height; on phones, widen it first so it still spans edge to edge.
      if (!fits.length) fits = Array.from(document.querySelectorAll<HTMLElement>("[data-fit]"));
      const narrow = innerWidth < 760;
      for (const el of fits) {
        const box = el.parentElement!;
        const br = box.getBoundingClientRect();
        if (br.bottom < 0 || br.top > vh) continue;
        // Measured at its natural width, so the scale never feeds back into itself.
        const full = el.dataset.fit === "full";
        if (full) {
          el.style.width = "100%";
          el.style.marginLeft = el.style.marginRight = "auto";
        }
        const sc = Math.min(1, (box.clientHeight - 136) / (el.offsetHeight || 1)).toFixed(3);
        if (full && narrow && sc !== "1.000") {
          const w = 100 / Number(sc);
          el.style.flexShrink = "0";
          el.style.width = `${w}%`;
          el.style.marginLeft = el.style.marginRight = `${(100 - w) / 2}%`;
        }
        if (el.dataset.s !== sc) {
          el.dataset.s = sc;
          el.style.transform = sc === "1.000" ? "" : `scale(${sc})`;
        }
      }

      let active = 0;
      ps.forEach((x, i) => {
        if (x.top <= vh * 0.5) active = i;
      });
      const a = ps[1]?.p ?? 0;
      const next: Scrub = {
        active,
        askChars: Math.round(clamp((a - 0.05) / 0.35) * ASK.length),
        ask: steps(a, [0.5, 0.66, 0.82]),
        check: Math.min(7, Math.floor(clamp(((ps[2]?.p ?? 0) - 0.06) / 0.82) * 7)),
        links: steps(ps[3]?.p ?? 0, [0.15, 0.35, 0.55, 0.75]),
        report: steps(ps[4]?.p ?? 0, [0.1, 0.3, 0.5, 0.7]),
        swap: steps(ps[5]?.p ?? 0, [0.1, 0.3, 0.55, 0.78]),
        gate: steps(ps[6]?.p ?? 0, [0.15, 0.35, 0.55, 0.75]),
      };
      const prev = stateRef.current;
      if ((Object.keys(next) as (keyof Scrub)[]).some((k) => next[k] !== prev[k])) setS(next);

      // Vana eases towards the slot of the chapter in view.
      const ph = phs.current[active];
      const v = flyer.current;
      if (ph && v) {
        const r = ph.getBoundingClientRect();
        const sz = Math.min(r.width, r.height);
        const tx = r.left + (r.width - sz) / 2;
        const ty = r.top + (r.height - sz) / 2;
        if (!cur) {
          cur = { x: tx, y: ty, w: sz };
          v.style.opacity = "1";
        }
        cur.x += (tx - cur.x) * 0.14;
        cur.y += (ty - cur.y) * 0.14;
        cur.w += (sz - cur.w) * 0.14;
        v.style.transform = `translate3d(${cur.x.toFixed(1)}px,${cur.y.toFixed(1)}px,0) scale(${(cur.w / 400).toFixed(4)})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(heroT);
      removeEventListener("resize", onResize);
    };
  }, []);

  const goTo = (i: number) => {
    const el = secs.current[i];
    if (!el) return;
    const top = el.getBoundingClientRect().top + scrollY + (i === 0 ? 0 : innerHeight * 0.1);
    scrollTo({ top: i === 0 ? 0 : top, behavior: "smooth" });
  };
  const sec = (i: number) => (el: HTMLElement | null) => void (secs.current[i] = el);
  const ph = (i: number) => (el: HTMLDivElement | null) => void (phs.current[i] = el);

  const sent = s.ask >= 1;
  const typed = sent ? "" : ASK.slice(0, s.askChars);
  const full = !sent && s.askChars === ASK.length;
  const k = s.check;

  return (
    // The landing is dark whatever the app's theme.
    <div data-theme="dark" className="relative min-h-screen overflow-x-clip bg-bg text-[15px] leading-normal text-text antialiased [--off:color-mix(in_srgb,var(--none)_40%,var(--line))]">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-line/60 bg-bg/80 px-[5vw] backdrop-blur-[10px]">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goTo(0);
          }}
          className="flex items-center gap-2.5"
        >
          <Image src={vana} alt="" width={30} height={30} unoptimized className="size-[30px]" />
          <span className="font-display text-[22px] tracking-[0.04em] text-accent">VANA</span>
        </a>
        <Link href="/app" className={clsx(STICKER, "gap-2 rounded-full px-[18px] py-2 text-sm")}>
          Open app
        </Link>
      </header>

      <div ref={flyer} aria-hidden className="pointer-events-none fixed top-0 left-0 z-30 size-[400px] origin-top-left opacity-0 drop-shadow-[0_18px_36px_rgb(0_0_0/0.45)] transition-opacity duration-[400ms]">
        <Mascot mood={moodOf(s)} size={400} track />
      </div>

      <nav
        aria-label="Chapters"
        className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/90 py-2 pr-2.5 pl-3.5 shadow-[0_12px_32px_rgb(0_0_0/0.4)] backdrop-blur-[10px]"
      >
        <span className="flex items-center gap-2 text-[13px] whitespace-nowrap text-text-2">
          <span className="font-mono text-xs text-none">{String(s.active).padStart(2, "0")} / 06</span>
          <span className="font-medium text-text">{RAIL[s.active]}</span>
        </span>
        <span className="flex items-center gap-1">
          {RAIL.map((label, i) => (
            <button key={label} type="button" onClick={() => goTo(i)} aria-label={label} title={label} aria-current={s.active === i ? "step" : undefined} className="grid h-[22px] place-items-center px-px">
              <span
                className={clsx(
                  "block h-1.5 rounded-full transition-[width,background-color] duration-300",
                  s.active === i ? "w-7 bg-accent" : i < s.active ? "w-4 bg-muted" : "w-4 bg-[color-mix(in_srgb,var(--muted)_35%,var(--line))]",
                )}
              />
            </button>
          ))}
        </span>
      </nav>

      {/* 00 · Hero */}
      <section ref={sec(0)} aria-label="Start" className="relative" style={{ height: `${HEIGHTS[0]}vh`, "--p": 0, "--pp": 0 } as CSSProperties}>
        <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden py-16">
          {wide && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {(
                [
                  ["left-[4%] top-[24%]", -340, -4, "bg-warn", "SWEAT", false],
                  ["left-[5%] top-[82%]", -620, 3, "bg-bad", "BLACKDRAGON", false],
                  ["left-[14%] top-[14%]", -180, 2, "bg-ok", "USDC", true],
                  ["right-[4%] top-[28%]", -520, 4, "bg-none", "SHITZU", false],
                  ["right-[5%] top-[84%]", -260, -3, "bg-ok", "NEAR", true],
                  ["right-[13%] top-[14%]", -420, -2, "bg-accent", GATE_SYMBOL, false],
                ] as const
              ).map(([pos, drift, tilt, dot, label, small]) => (
                <div key={label} className={clsx("absolute", pos, small && "opacity-70")} style={{ transform: `translateY(calc(var(--pp) * ${drift}px)) rotate(${tilt}deg)` }}>
                  <span className={clsx("flex items-center gap-2 rounded-full border border-line bg-surface font-mono", small ? "px-3 py-1.5 text-xs" : "px-3.5 py-[7px] text-[13px]")}>
                    <span className={clsx("size-2 rounded-full", dot)} />
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div data-fit="1" className="relative z-[1] origin-center">
            <div
              className="flex flex-col items-center gap-5 px-6 py-4 text-center"
              style={{ opacity: "calc(1 - var(--p) * 1.8)", transform: "translateY(calc(var(--p) * -90px))" }}
            >
              <div ref={ph(0)} className="aspect-square w-[min(260px,32vh,56vw)]" />
              <Intro hero title="Is this NEAR token safe?" body="I check NEAR tokens, dig into who's behind them, and line up the swap when you're ready." />
              <div className="tx mt-1.5 flex flex-wrap justify-center gap-3" style={{ "--d": "1.2s" } as CSSProperties}>
                <Link href="/app" className={clsx(STICKER, "gap-2 rounded-full px-[22px] py-[11px] text-[15px]")}>
                  Ask VANA
                </Link>
                <button type="button" onClick={() => goTo(1)} className={clsx(QUIET, "gap-2 rounded-full px-[22px] py-[11px] text-[15px] whitespace-nowrap text-text")}>
                  See how it works <ArrowDown size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 01 · Ask */}
      <Chapter index={1} label="ask" secRef={sec(1)} phRef={ph(1)} title="Ask about any token." body="A symbol, a contract, or a ticker you half-remember from a group chat. I'll figure it out.">
        <div className={clsx(CARD, "flex h-[400px] flex-col overflow-hidden")}>
          <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line px-4">
            <span className="text-sm font-medium">{sent ? ASK : "New chat"}</span>
            <span className="rounded-full border border-line px-2 py-px text-[11px] text-text-2">mainnet</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-4 py-[18px]">
            {sent ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-card rounded-br-md bg-bubble px-4 py-2.5">{ASK}</div>
              </div>
            ) : (
              <div className="m-auto text-center text-sm text-text-2">Ask about any NEP-141 token.</div>
            )}
            <Reveal on={s.ask >= 2} className="flex items-center gap-2 text-[13px] text-text-2">
              <Check size={14} strokeWidth={2.5} className="text-accent" /> Found <span className="font-mono text-text">SWEAT</span> · <span className="font-mono">token.sweat</span> · verified
            </Reveal>
            <Reveal on={s.ask >= 3} className="flex items-center gap-2 text-[13px] text-text-2">
              <Spin /> Running 7 checks on public chain data
            </Reveal>
          </div>
          <div className={clsx("mx-3 mb-3 flex items-end gap-2 rounded-card border bg-bg py-2.5 pr-2.5 pl-3.5 transition-colors duration-300", !sent && s.askChars > 0 ? "border-muted" : "border-line")}>
            <div className="flex min-h-11 flex-1 flex-wrap items-start text-[15px]">
              {typed ? <span>{typed}</span> : <span className="text-none">Ask about a NEAR token, e.g. “is SWEAT safe?”</span>}
              {!sent && s.askChars > 0 && <span className="mt-0.5 ml-px inline-block h-[19px] w-0.5 bg-accent" />}
            </div>
            <span
              className={clsx(
                "grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors duration-300",
                full ? "border-text-2 bg-accent text-accent-ink shadow-sticker" : "border-line bg-surface-2 text-text-2",
              )}
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </span>
          </div>
        </div>
      </Chapter>

      {/* 02 · Check */}
      <Chapter index={2} label="check" secRef={sec(2)} phRef={ph(2)} title="Seven checks, the same for every token." body="Read-only, public chain data, zero vibes. I ask the same seven questions of every token, even the cute ones.">
        <div className={clsx(CARD, "overflow-hidden")}>
          <div className="flex flex-col gap-2.5 border-b border-line px-[18px] py-3.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="font-mono text-base font-semibold">SWEAT</span>
              <span className="font-mono text-xs text-text-2">token.sweat</span>
              <span className={clsx(PILL_WATCH, "ml-auto transition-opacity duration-[400ms]")} style={{ opacity: k >= 7 ? 1 : 0 }}>
                ! Things to watch
              </span>
            </div>
            <div className="flex gap-1">
              {CHECKS.map((c, i) => (
                <span
                  key={c.title}
                  className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-300", i < k ? LV[c.level].bar : i === k ? "bg-accent/45" : "bg-surface-2")}
                />
              ))}
            </div>
            <div className="text-xs text-text-2">
              {k < 7 ? `Checking ${k + 1} of 7 · ${CHECKS[k]?.title}` : "7 checks · 6 sources · 2 things to watch: contract and holders."}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {CHECKS.map((c, i) => {
              const done = i < k;
              const scanning = i === k && k < 7;
              const l = LV[c.level];
              return (
                <li
                  key={c.title}
                  className={clsx("flex items-start gap-3 px-[18px] py-2.5 transition-[background-color,opacity] duration-300", scanning && "bg-accent/5")}
                  style={{ opacity: done || scanning ? 1 : 0.4 }}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "mt-px grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] text-[10px] leading-none font-bold",
                      done ? l.mark : scanning ? "border-transparent" : "border-dashed border-[color-mix(in_srgb,var(--muted)_35%,var(--line))]",
                    )}
                  >
                    {scanning ? <Spin /> : done ? l.icon : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{c.title}</span>
                      <span className={clsx("text-[10px] font-semibold tracking-[0.08em] uppercase", done ? l.word_ : "text-accent")}>{done ? l.word : scanning ? "Checking" : ""}</span>
                    </span>
                    {(done || scanning) && <span className="text-[13px] text-pretty text-text-2">{done ? c.summary : c.about}</span>}
                    {scanning && (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-none">
                        Reading
                        {c.sources.map((src) => (
                          <span key={src} className="rounded-md bg-surface-2 px-[7px] py-px font-mono text-accent">
                            {src}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Chapter>

      {/* 03 · Early buyers */}
      <Chapter index={3} label="early-buyers" secRef={sec(3)} phRef={ph(3)} title="Is the dev hiding among the first buyers?" body="Devs love buying their own launch from a fresh wallet. I follow the funding and say hi.">
        <div className={clsx(CARD, "flex flex-col gap-3 px-[18px] py-4")}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-[13px] font-semibold">rug.vanarug4hgzsi.testnet</span>
            <span className="rounded-full border border-line px-2 py-px text-[11px] text-text-2">Demo token</span>
            <span className="ml-auto text-xs text-text-2">First 12 buyers</span>
          </div>
          <div className="relative mx-auto my-1 aspect-square w-full max-w-[min(330px,40vh)]">
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--line)" strokeWidth="0.4" strokeDasharray="1 1.5" />
              {(
                [
                  [70, 15.4, 1, 40, 0],
                  [70, 84.6, 1, 40, 0.1],
                  [15.4, 70, 1, 40, 0.2],
                  [15.4, 30, 2, 40, 0],
                ] as const
              ).map(([x2, y2, at, len, delay]) => (
                <line
                  key={`${x2}-${y2}`}
                  x1="50"
                  y1="50"
                  x2={x2}
                  y2={y2}
                  stroke="var(--bad)"
                  strokeWidth="0.6"
                  style={{ strokeDasharray: len, strokeDashoffset: s.links >= at ? 0 : len, transition: `stroke-dashoffset .7s ease ${delay}s` }}
                />
              ))}
              <line x1="70" y1="84.6" x2="50" y2="90" stroke="var(--bad)" strokeWidth="0.6" style={{ strokeDasharray: 21, strokeDashoffset: s.links >= 3 ? 0 : 21, transition: "stroke-dashoffset .7s ease" }} />
            </svg>
            <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
              <span className={clsx("rounded-full border-[1.5px] bg-bg px-3 py-1 text-xs font-semibold transition-colors duration-300", s.links >= 1 ? "border-bad" : "border-(--off)")}>dev</span>
              <span className="font-mono text-[10px] text-text-2">vanarug4hgzsi</span>
            </div>
            {RING.map(([x, y], i) => {
              const link = LINKS[i];
              const hit = Boolean(link && s.links >= link[0]);
              return (
                <div key={LABELS[i]} className="absolute flex -translate-x-1/2 -translate-y-[7px] flex-col items-center gap-[3px] whitespace-nowrap" style={{ left: `${x}%`, top: `${y}%` }}>
                  <span className={clsx("size-3.5 rounded-full border-[1.5px] transition-colors duration-300", hit ? "border-bad bg-bad" : "border-(--off) bg-surface-2")} />
                  <span className={clsx("font-mono text-[10px] transition-colors duration-300", hit ? "text-text" : "text-text-2")}>{LABELS[i]}</span>
                  <span className="text-[9px] font-semibold tracking-[0.06em] text-bad uppercase transition-opacity duration-300" style={{ opacity: hit ? 1 : 0 }}>
                    {link?.[1] ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5 text-[13px]">
            {(
              [
                ["Same funder as the dev", "3 wallets", 1],
                ["Sub-account of the dev", "1 wallet", 2],
                ["Coins passed between them", "1 wallet", 3],
              ] as const
            ).map(([label, n, at]) => (
              <div key={label} className="flex items-center gap-2.5 transition-opacity duration-300" style={{ opacity: s.links >= at ? 1 : 0.35 }}>
                <span className={clsx("size-2 shrink-0 rounded-full", s.links >= at ? "bg-bad" : "bg-[color-mix(in_srgb,var(--muted)_35%,var(--line))]")} />
                <span className="flex-1">{label}</span>
                <span className="font-mono text-xs text-text-2">{n}</span>
              </div>
            ))}
          </div>
          <Reveal on={s.links >= 4} className="flex items-center gap-2.5 rounded-well border border-bad/45 bg-bad/10 px-3 py-2.5 text-[13px]">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bad text-[10px] font-bold text-on-level">✕</span>
            <span>
              <span className="font-semibold text-bad">Red flag.</span> 5 of the first 12 buyers tie back to the dev.
            </span>
          </Reveal>
        </div>
      </Chapter>

      {/* 04 · Answer */}
      <Chapter index={4} label="report" secRef={sec(4)} phRef={ph(4)} title="Every number has a source." body="No “trust me bro.” Every figure I give you comes with where I read it and when.">
        <div className="flex flex-col gap-3">
          <Reveal on={s.report >= 1} className="flex items-center gap-2 text-[13px] text-text-2">
            <Check size={14} strokeWidth={2.5} className="text-accent" /> Checked token.sweat · 7 checks · 6 sources
          </Reveal>
          <Reveal on={s.report >= 1} delay={0.08}>
            <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="font-mono text-[15px] font-semibold">SWEAT</span>
                <span className="font-mono text-xs text-text-2">token.sweat</span>
                <span className={clsx(PILL_WATCH, "ml-auto")}>! Things to watch</span>
              </div>
              <div className="flex gap-1">
                {CHECKS.map((c) => (
                  <span key={c.title} className={clsx("h-1.5 flex-1 rounded-full", LV[c.level].bar)} />
                ))}
              </div>
              <span className="text-[13px] text-text-2">2 things to watch: contract and holders.</span>
            </div>
          </Reveal>
          <Reveal on={s.report >= 2} className="mt-1 text-base text-pretty">
            No red flags on SWEAT. Two things to watch: the owner account <code className="rounded-md bg-surface-2 px-[5px] py-px font-mono text-[13px]">sweat_welcome.near</code> can upgrade
            the contract
            <Cite on={s.report >= 4}>NEAR RPC</Cite>, and the top 10 wallets hold 61.4% of the supply outside pools and lockers
            <Cite on={s.report >= 4}>FastNEAR</Cite>.
          </Reveal>
          <Reveal on={s.report >= 3} className="text-base text-pretty">
            Liquidity is $412.6k across 3 Rhea pools, and no single account can pull it<Cite on={s.report >= 4}>Rhea</Cite>. There is no buy or sell tax.
          </Reveal>
          <Reveal on={s.report >= 4} className="flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-line pt-3 text-xs text-text-2">
            <span className="text-none">Sources</span>
            {["NEAR RPC", "FastNEAR API", "NearBlocks", "Rhea"].map((src) => (
              <span key={src}>
                {src} <span className="font-mono text-none">14:32</span>
              </span>
            ))}
          </Reveal>
        </div>
      </Chapter>

      {/* 05 · Swap */}
      <Chapter index={5} label="swap" secRef={sec(5)} phRef={ph(5)} title="Your wallet signs, never the AI." body="I line up the best quote I can find. The approve button stays in your wallet, where it belongs.">
        <div className="relative flex flex-col gap-3">
          <Reveal on={s.swap >= 1} className="flex justify-end">
            <div className="max-w-[85%] rounded-card rounded-br-md bg-bubble px-4 py-2.5">Swap 5 NEAR to SWEAT</div>
          </Reveal>
          <Reveal on={s.swap >= 2} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-text-2">
              <Check size={14} strokeWidth={2.5} className="text-accent" /> Prepared 5 NEAR → SWEAT
            </div>
            <section aria-label="Swap approval" className="overflow-hidden rounded-card border border-accent/45 bg-surface">
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <span className="font-medium">Swap</span>
                <span
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors duration-300",
                    s.swap >= 4 ? "border-ok/60 text-ok" : "border-warn/60 text-warn",
                  )}
                >
                  {s.swap >= 4 ? "✓ Signed" : "! Things to watch"}
                </span>
              </header>
              <div className="flex flex-col gap-1.5 px-4 py-3">
                {(
                  [
                    ["You pay", "5 NEAR", "$14.85"],
                    ["You get about", "2,318.4 SWEAT", "$14.79"],
                  ] as const
                ).map(([label, amount, usd]) => (
                  <div key={label} className="rounded-well bg-surface-2 px-3 py-[9px]">
                    <div className="text-xs text-text-2">{label}</div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[17px] font-semibold">{amount}</span>
                      <span className="text-xs text-text-2">{usd}</span>
                    </div>
                  </div>
                ))}
                <div className="mt-1 flex justify-between gap-3 text-[13px]">
                  <span className="text-text-2">At least</span>
                  <span className="font-mono">2,295.2 SWEAT</span>
                </div>
              </div>
              <div className="mx-4 mb-3 flex gap-2 rounded-well border border-warn/40 bg-warn/10 px-3 py-[9px] text-[13px] text-warn">SWEAT has 2 things to watch: contract and holders.</div>
              <div className="border-t border-line px-4 pt-3 pb-3.5">
                <div
                  className="flex items-center justify-center gap-2 rounded-well border-2 border-edge bg-accent px-4 py-2.5 font-medium text-accent-ink transition-[transform,box-shadow] duration-150"
                  style={{ boxShadow: s.swap >= 3 ? "none" : "var(--shadow-sticker)", transform: s.swap >= 3 ? "translate(3px,3px)" : "none" }}
                >
                  <Wallet size={16} /> Approve in wallet
                </div>
              </div>
            </section>
          </Reveal>
          <div
            className="absolute inset-x-[6%] -bottom-[18px] z-[2] flex flex-col gap-3 rounded-[18px] border border-muted bg-[color-mix(in_srgb,var(--surface)_70%,var(--bg))] px-[18px] py-4 shadow-[0_24px_60px_rgb(0_0_0/0.55)] transition-[opacity,transform] duration-[450ms]"
            style={{ opacity: s.swap >= 3 ? 1 : 0, transform: s.swap >= 3 ? "none" : "translateY(40px)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] tracking-[0.1em] text-text-2 uppercase">Your wallet</span>
              <span className="font-mono text-xs">vana-fan.near</span>
            </div>
            {s.swap < 4 ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">Confirm transaction</span>
                  <span className="text-[13px] text-text-2">Swap 5 NEAR for at least 2,295.2 SWEAT · gas ~0.003 NEAR</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="rounded-well border border-line p-[9px] text-center text-sm text-text-2">Reject</span>
                  <span className="rounded-well border-2 border-edge bg-accent p-[9px] text-center text-sm font-medium text-accent-ink shadow-sticker">Approve</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok font-bold text-on-level">✓</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">Signed by you</span>
                  <span className="font-mono text-[13px] text-text-2">5 NEAR → 2,318.4 SWEAT</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Chapter>

      {/* 06 · Access */}
      <Chapter
        index={6}
        label="access"
        secRef={sec(6)}
        phRef={ph(6)}
        demoClass="max-w-[460px]"
        title={`I'm for ${GATE_SYMBOL} holders`}
        body={`Hold ${GATE_MIN.toLocaleString("en-US")} ${GATE_SYMBOL} to chat with me and check tokens. Swaps are open to everyone. I'm picky, not snobby.`}
      >
        <div className="flex flex-col gap-3.5">
          <ol className="flex flex-col rounded-card border border-line bg-surface p-1.5 text-[15px]">
            {["Connect your wallet", "Sign in with it (a signature, no transaction)", `Hold ${GATE_MIN.toLocaleString("en-US")} ${GATE_SYMBOL}`].map((label, i) => {
              const done = s.gate > i;
              const now = s.gate === i;
              return (
                <li key={label} className={clsx("flex items-center gap-3 rounded-[10px] p-3 transition-colors duration-300", now && "bg-surface-2")}>
                  <span
                    className={clsx(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-300",
                      done || now ? "bg-accent text-accent-ink" : "bg-surface-2 text-text-2",
                    )}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={clsx("flex-1", done || now ? "text-text" : "text-text-2", now && "font-medium")}>{label}</span>
                  {now && <span className="text-xs text-accent">Now</span>}
                </li>
              );
            })}
          </ol>
          <Reveal on={s.gate >= 4} className="flex items-center justify-between gap-2 rounded-[14px] border border-line bg-surface px-3.5 py-3">
            <div>
              <div className="text-[11px] tracking-[0.08em] text-text-2 uppercase">Access</div>
              <div className="font-mono text-[15px] font-semibold">512,450 {GATE_SYMBOL}</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-ok/60 px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap text-ok">✓ Unlocked</span>
          </Reveal>
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            <Link href="/app" className={clsx(STICKER, "gap-2 rounded-full px-[22px] py-[11px] text-[15px]")}>
              <Wallet size={16} /> Connect wallet
            </Link>
            <Link href="/app" className={clsx(QUIET, "gap-2 rounded-full px-[22px] py-[11px] text-[15px] text-text")}>
              <ArrowLeftRight size={16} /> Get {GATE_SYMBOL}
            </Link>
          </div>
        </div>
      </Chapter>

      <footer className="relative z-[31] flex flex-wrap items-center justify-between gap-4 border-t border-line bg-bg px-[6vw] py-10 text-[13px] text-text-2">
        <div className="flex items-center gap-2.5">
          <Image src={vana} alt="" width={26} height={26} unoptimized className="size-[26px]" />
          <span className="font-display text-lg tracking-[0.04em] text-accent">VANA</span>
        </div>
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-accent" /> Read-only checks from public chain data. Not financial advice. Your wallet signs, never the AI.
        </span>
      </footer>
    </div>
  );
}

/** A source tag after a sentence; it lights up once the sources are listed. */
function Cite({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className={clsx("ml-1 inline-block rounded-md px-1.5 align-[2px] font-mono text-[11px] text-accent transition-colors duration-300", on ? "bg-accent/15" : "bg-surface-2")}>
      {children}
    </span>
  );
}
