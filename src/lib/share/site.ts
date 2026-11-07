import type { Metadata } from "next";

/** Where the app is served. Link previews need absolute URLs, so metadata resolves against this. */
export const SITE_URL = new URL(process.env.SITE_URL || "https://vana.nearvana.trade");

export const SITE_NAME = "VANA";
export const SITE_TITLE = "VANA — is this NEAR token safe?";
export const SITE_DESCRIPTION =
  "VANA checks NEAR tokens, digs into who's behind them, and lines up the swap when you're ready. Your wallet signs, never the AI.";

/** The preview card `app/opengraph-image.tsx` draws. */
export const OG_ALT = "VANA: is this NEAR token safe? A token check and swap agent for NEAR.";
export const OG_SIZE = { width: 1200, height: 630 };

/** The card itself, for pages below the root: one that sets `openGraph` drops the layout's image. */
const CARD_IMAGE = { url: "/opengraph-image", ...OG_SIZE, type: "image/png", alt: OG_ALT };

/**
 * A page's title, description, canonical address and share cards. A page that sets `openGraph`
 * replaces the layout's whole, so this states all of it.
 */
export function pageMetadata({ title, description = SITE_DESCRIPTION, path }: { title: string; description?: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { siteName: SITE_NAME, locale: "en_US", type: "website", title, description, url: path, images: [CARD_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [CARD_IMAGE] },
  };
}
