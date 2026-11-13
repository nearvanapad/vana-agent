/**
 * Refuses a POST another site could have made the browser send. It must be JSON: a cross-site
 * form or `no-cors` fetch can't set that type, and a cross-site fetch that does needs a CORS
 * preflight, which this app never answers. When the browser says where the request comes from,
 * that must be this site.
 */
export function crossSite(req: Request): Response | null {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return Response.json({ error: "Send JSON." }, { status: 415 });
  }
  const origin = req.headers.get("origin");
  if (origin !== null) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let from: string | null = null;
    try {
      from = new URL(origin).host;
    } catch {}
    if (from !== host) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  return null;
}
