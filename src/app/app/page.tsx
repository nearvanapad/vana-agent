import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";
import { pageMetadata } from "@/lib/share/site";

export const metadata: Metadata = pageMetadata({
  title: "VANA — NEAR token agent",
  description: "Ask VANA if a NEAR token is safe, then swap it. Your wallet signs, never the AI.",
  path: "/app",
});

export default function App() {
  return <ChatApp />;
}
