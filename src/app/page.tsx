import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { pageMetadata, SITE_TITLE } from "@/lib/share/site";

export const metadata: Metadata = pageMetadata({ title: SITE_TITLE, path: "/" });

export default function Home() {
  return <Landing />;
}
