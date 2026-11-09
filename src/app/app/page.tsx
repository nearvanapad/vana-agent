import { ChatAppClient } from "./client";
import { pageMetadata } from "@/lib/share/metadata";

export const generateMetadata = () =>
  pageMetadata({
    title: "VANA — NEAR token agent",
    description: "Ask VANA if a NEAR token is safe, then swap it. Your wallet signs, never the AI.",
    path: "/app",
  });

export default function App() {
  return <ChatAppClient />;
}
