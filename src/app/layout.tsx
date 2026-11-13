import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { bowlby, jetbrains, rubik } from "./fonts";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/share/site";
import { INSTALL_SCRIPT } from "@/lib/pwa/install";
import { THEME_SCRIPT } from "@/lib/theme";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { Providers } from "./providers";

// The share image comes from `opengraph-image.tsx` beside this file.
export const metadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { siteName: SITE_NAME, locale: "en_US", type: "website", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // Installed as an app (manifest.ts): the home-screen icon and title on iPhone and iPad.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};

// Lets the mobile tab bar pad itself clear of the home indicator.
// The browser bar and the installed app's title bar take the page background.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a1612" },
    { media: "(prefers-color-scheme: light)", color: "#f6f9f4" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The head script sets data-theme before paint, so the server markup differs from the DOM.
    <html lang="en" className={`${bowlby.variable} ${rubik.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Keeps the browser's install prompt for the Install button, before any bundle loads. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
