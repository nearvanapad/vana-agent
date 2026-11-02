import type { Metadata } from "next";
import type { ReactNode } from "react";
import { bowlby, jetbrains, rubik } from "./fonts";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VANA — NEAR token agent",
  description: "Ask VANA if a NEAR token is safe, then swap it through NEAR Intents. Your wallet signs, never the AI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bowlby.variable} ${rubik.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
