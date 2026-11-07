import { Landing } from "@/components/landing/landing";
import { pageMetadata } from "@/lib/share/metadata";
import { SITE_TITLE } from "@/lib/share/site";

export const generateMetadata = () => pageMetadata({ title: SITE_TITLE, path: "/" });

export default function Home() {
  return <Landing />;
}
