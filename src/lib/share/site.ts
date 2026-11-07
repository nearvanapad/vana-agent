/** Where the app is served. Link previews need absolute URLs, so metadata resolves against this. */
export const SITE_URL = new URL(process.env.SITE_URL || "https://vana.nearvana.trade");

export const SITE_NAME = "VANA";
export const SITE_TITLE = "VANA — is this NEAR token safe?";
export const SITE_DESCRIPTION =
  "VANA checks NEAR tokens, digs into who's behind them, and lines up the swap when you're ready. Your wallet signs, never the AI.";

/** The preview card `app/opengraph-image.tsx` draws. */
export const OG_ALT = "VANA: is this NEAR token safe? A token check and swap agent for NEAR.";
export const OG_SIZE = { width: 1200, height: 630 };
