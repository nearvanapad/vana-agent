import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/share/site";

/** Makes VANA installable as an app; it opens straight into the chat. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#0a1612",
    theme_color: "#0a1612",
    categories: ["finance", "utilities"],
    // Lets Chromium tell from a browser tab that the app is already installed (lib/pwa/install.ts).
    related_applications: [{ platform: "webapp", url: "/manifest.webmanifest" }],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
