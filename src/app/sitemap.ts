import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/share/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL("/", SITE_URL).href, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/app", SITE_URL).href, changeFrequency: "weekly", priority: 0.8 },
  ];
}
