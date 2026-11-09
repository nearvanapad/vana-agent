"use client";

import dynamic from "next/dynamic";

/**
 * The app renders in the browser only: the wallet's network is the visitor's pick, read from a
 * cookie when the modules load, and server markup made without it would not match.
 */
export const ChatAppClient = dynamic(() => import("@/components/chat/chat-app").then((m) => m.ChatApp), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});
