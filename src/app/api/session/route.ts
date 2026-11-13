import { z } from "zod";
import { verifyEthSignIn } from "@/lib/auth/eth";
import { challenge, SignInError, verifySignIn } from "@/lib/auth/nep413";
import { ensureSession, readSession, signIn, signOut } from "@/lib/auth/session";
import { access } from "@/lib/gate/access";
import { crossSite } from "@/lib/http/same-site";

/** Who the browser is (a guest, or a wallet account signed in with NEP-413 or, for `0x` accounts, Sign-In with Ethereum) and whether it may chat. `?fresh=1` rereads the balance. */
export async function GET(req: Request) {
  const s = await ensureSession();
  const fresh = new URL(req.url).searchParams.has("fresh");
  return Response.json({ account: s.account, access: await access(s.account, { fresh }) });
}

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("challenge") }),
  z.object({
    step: z.literal("verify"),
    accountId: z.string().min(2).max(64),
    publicKey: z.string().max(128),
    signature: z.string().max(256),
    nonce: z.string().max(64),
  }),
  // NEAR accounts controlled by an Ethereum key sign in with Ethereum (see lib/auth/eth.ts).
  z.object({
    step: z.literal("verify-eth"),
    accountId: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    nonce: z.string().max(64),
    issuedAt: z.iso.datetime(),
  }),
]);

/** The NEP-413 recipient: the host the user sees, so a signature for another site can't be replayed here. */
const recipientOf = (req: Request) => req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "vana";

/** The page's origin, for the Sign-In with Ethereum URI. */
function originOf(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  return `${proto}://${recipientOf(req)}`;
}

export async function POST(req: Request) {
  const refused = crossSite(req);
  if (refused) return refused;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const s = await ensureSession();
  if (body.data.step === "challenge") return Response.json({ ...challenge(recipientOf(req)), uri: originOf(req) });
  try {
    const account =
      body.data.step === "verify-eth"
        ? await verifyEthSignIn(body.data, { domain: recipientOf(req), uri: originOf(req) }, s.network)
        : await verifySignIn(body.data, recipientOf(req), s.network);
    const signed = signIn(s, account).account;
    return Response.json({ account: signed, access: await access(signed, { fresh: true }) });
  } catch (e) {
    const msg = e instanceof SignInError ? e.message : "Sign-in failed. Try again.";
    return Response.json({ error: msg }, { status: 401 });
  }
}

export async function DELETE() {
  const s = await readSession();
  if (s) signOut(s);
  return Response.json({ account: null, access: await access(null) });
}
