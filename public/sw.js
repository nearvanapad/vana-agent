/**
 * VANA's service worker. Browsers offer to install a site as an app only when it has one with a
 * fetch handler. It only answers page loads, network first, and shows a short offline page
 * when there is no connection. Scripts, styles, the API and wallet traffic go straight to the
 * network, untouched, and nothing is cached: chat and swaps need live data anyway.
 */

const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VANA is offline</title><link rel="icon" href="data:,">
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0a1612;color:#e8fbee;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}button{margin-top:16px;padding:10px 20px;border-radius:999px;border:2px solid #0a1612;background:#69de8a;color:#141c1e;font:inherit;font-weight:600}</style></head>
<body><div><h1 style="font-size:22px;margin:0 0 8px">You're offline</h1><p style="margin:0;color:#b8dcc6">VANA needs a connection to check tokens and swap.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.resolve(self.registration.navigationPreload?.enable())
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(
    Promise.resolve(event.preloadResponse)
      .then((preloaded) => preloaded || fetch(request))
      .catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })),
  );
});
