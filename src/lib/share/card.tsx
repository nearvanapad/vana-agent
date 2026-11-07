import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { VanaArt } from "@/components/vana/art";
import { OG_SIZE, SITE_URL } from "./site";

/*
 * The link-preview card: 1200 × 630, drawn once at build time. Vana on the brand's dark green,
 * the landing page's question, and the address.
 */

const VOID = "#0a1612";
const SURFACE = "#12221d";
const LINE = "#22392f";
const ACCENT = "#69de8a";
const HIGHLIGHT = "#87f4a6";
const TEXT = "#e8fbee";
const TEXT_2 = "#b8dcc6";

/** From the project root; `next.config.ts` traces the folder into the standalone build. */
const FONT_DIR = join(process.cwd(), "src/lib/share/fonts");

async function fonts() {
  const font = (file: string) => readFile(join(FONT_DIR, file));
  const [bowlby, rubik, mono] = await Promise.all([font("BowlbyOne-Regular.ttf"), font("Rubik-Bold.ttf"), font("JetBrainsMono-Bold.ttf")]);
  return [
    { name: "Bowlby", data: bowlby, weight: 400 as const },
    { name: "Rubik", data: rubik, weight: 700 as const },
    { name: "Mono", data: mono, weight: 700 as const },
  ];
}

/**
 * Inside `<svg>`, `next/og` takes plain SVG elements only: this calls the components and unwraps
 * the fragments down to them.
 */
function intrinsic(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(intrinsic);
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return intrinsic((el.type as (props: unknown) => ReactNode)(el.props));
  const kids = Children.toArray(el.props.children).map(intrinsic);
  return (el.type as unknown) === Fragment ? kids : cloneElement(el, undefined, ...kids);
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", border: `2px solid ${LINE}`, background: SURFACE, color: TEXT_2, borderRadius: 999, padding: "8px 20px" }}>
      {children}
    </div>
  );
}

export async function siteCard() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 56,
        padding: "0 72px",
        background: `radial-gradient(circle at 78% 40%, #173431 0%, ${VOID} 60%)`,
        color: TEXT,
        fontFamily: "Rubik",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 28 }}>
        <span style={{ fontFamily: "Bowlby", fontSize: 40, letterSpacing: 2, color: ACCENT }}>VANA</span>
        <span style={{ fontFamily: "Bowlby", fontSize: 84, lineHeight: 1.02 }}>IS THIS NEAR TOKEN SAFE?</span>
        <span style={{ fontSize: 30, lineHeight: 1.35, color: TEXT_2 }}>
          Ask before you buy. Then swap it, signed by your wallet, never the AI.
        </span>
        <div style={{ display: "flex", gap: 12, fontFamily: "Mono", fontSize: 22, marginTop: 8 }}>
          <Chip>Contract</Chip>
          <Chip>Holders</Chip>
          <Chip>Liquidity</Chip>
          <Chip>Creator</Chip>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", transform: "rotate(3deg)", borderRadius: 40, boxShadow: `14px 14px 0 ${ACCENT}` }}>
          <svg viewBox="0 0 96 96" width={380} height={380}>
            {intrinsic(<VanaArt glow="og-glow" card="og-card" still />)}
          </svg>
        </div>
        <span style={{ fontFamily: "Mono", fontSize: 24, color: HIGHLIGHT }}>{SITE_URL.host}</span>
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}
