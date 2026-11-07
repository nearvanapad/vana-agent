import { siteCard } from "@/lib/share/card";
import { OG_ALT, OG_SIZE } from "@/lib/share/site";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return siteCard();
}
