import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "VANA — is this NEAR token safe?",
  description: "VANA checks NEAR tokens, digs into who's behind them, and lines up the swap when you're ready. Your wallet signs, never the AI.",
};

export default function About() {
  return <Landing />;
}
