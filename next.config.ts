import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the Docker image.
  output: "standalone",
  // Native module, loaded at runtime on the server only.
  serverExternalPackages: ["better-sqlite3"],
  headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Wallet approvals must never sit inside someone else's frame.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
