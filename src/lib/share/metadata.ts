import type { Metadata } from "next";
import { cardVersion } from "./card";
import { OG_ALT, OG_SIZE, SITE_DESCRIPTION, SITE_NAME } from "./site";

/**
 * A page's title, description, canonical address and share cards. A page that sets `openGraph`
 * replaces the layout's whole, so this states all of it, the card included.
 */
export async function pageMetadata({ title, description = SITE_DESCRIPTION, path }: { title: string; description?: string; path: string }): Promise<Metadata> {
  const image = { url: `/opengraph-image?v=${await cardVersion()}`, ...OG_SIZE, type: "image/png", alt: OG_ALT };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { siteName: SITE_NAME, locale: "en_US", type: "website", title, description, url: path, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
