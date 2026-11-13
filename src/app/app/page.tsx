import { ViewTransition } from "react";
import { ChatAppClient } from "./client";
import { pageMetadata } from "@/lib/share/metadata";

export const generateMetadata = () =>
  pageMetadata({
    title: "VANA — NEAR token agent",
    description: "Ask VANA if a NEAR token is safe, then swap it. Your wallet signs, never the AI.",
    path: "/app",
  });

export default function App() {
  return (
    // Rises in from the landing page (globals.css, `.page`). The app itself fades in when it
    // arrives (client.tsx).
    <ViewTransition enter="page" exit="page" default="none">
      <ChatAppClient />
    </ViewTransition>
  );
}
