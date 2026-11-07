import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { bowlby, jetbrains, rubik } from "./fonts";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/share/site";
import { THEME_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";

// The share image comes from `opengraph-image.tsx` beside this file.
export const metadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { siteName: SITE_NAME, locale: "en_US", type: "website", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

// Lets the mobile tab bar pad itself clear of the home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The head script sets data-theme before paint, so the server markup differs from the DOM.
    <html lang="en" className={`${bowlby.variable} ${rubik.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
