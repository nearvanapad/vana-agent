import {
  AttestationClient,
  createGpuEvidenceVerifier,
  createTdxQuoteVerifier,
  findModelAttestationsForSignature,
  verifyGatewayAttestation,
  verifyGatewayResponse,
  verifyModelAttestation,
  verifyModelResponse,
  type CompletionSignature,
  type VerifiedGatewayAttestation,
  type VerifiedModelAttestation,
} from "@nearai/inference-sdk/node";
import { kv } from "../db";
import { NEAR_AI, NEAR_AI_KEY, type Tier } from "./model";

/**
 * Verified answers on NEAR AI Cloud. Every model call of a reply is captured byte for byte; once the
 * reply is done, NEAR AI's signature of each call is fetched and checked against those bytes and
 * against an attestation we verify ourselves (Intel TDX quote, and NVIDIA GPU evidence for models):
 * - provider_tee: the model's own TEE signed it (Private replies, which are fetched whole for this);
 * - gateway: NEAR AI's TEE gateway signed it (streamed replies: Partner and Incognito).
 * Either way the reply, and the data our tools fed the model, can't have been changed after NEAR AI
 * produced it, by anyone, VANA's server included.
 */

export const VERIFY = NEAR_AI;

export type Call = { model: string; request: Uint8Array; response: Uint8Array; completionId: string | null };

export type Verification = {
  status: "pending" | "verified" | "failed";
  /** model: every call signed by the model's TEE. gateway: by NEAR AI's TEE gateway. */
  kind?: "model" | "gateway" | "mixed";
  tier?: Tier;
  model?: string;
  calls?: number;
  signer?: string;
  /** Intel TDX status of the attested hardware. */
  tcb?: string;
  /** NVIDIA GPU evidence, for model signatures. */
  gpu?: string;
  reason?: string;
  completion_ids?: string[];
  checked_at?: string;
};

// ─── Capture ────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function idOf(raw: Uint8Array, streamed: boolean): string | null {
  const text = dec.decode(raw);
  try {
    if (!streamed) return (JSON.parse(text) as { id?: string }).id ?? null;
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: {")) continue;
      const id = (JSON.parse(line.slice(6)) as { id?: string }).id;
      if (id) return id;
    }
  } catch {
    /* not JSON: no id, so no signature to look up */
  }
  return null;
}

type Completion = {
  id: string;
  created: number;
  model: string;
  choices: {
    index: number;
    finish_reason: string | null;
    message: { role: string; content: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] };
  }[];
  usage?: unknown;
};

/** A whole (non-streamed) completion replayed as the SSE stream the AI SDK asked for. */
function asStream(raw: Uint8Array): Response {
  const c = JSON.parse(dec.decode(raw)) as Completion;
  const chunk = (choices: unknown[], extra: object = {}) =>
    `data: ${JSON.stringify({ id: c.id, object: "chat.completion.chunk", created: c.created, model: c.model, choices, ...extra })}\n\n`;
  let out = "";
  for (const ch of c.choices) {
    const m = ch.message;
    const reasoning = m.reasoning_content ?? m.reasoning;
    out += chunk([
      {
        index: ch.index,
        delta: {
          role: "assistant",
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(m.content ? { content: m.content } : {}),
          ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((t, i) => ({ index: i, ...t })) } : {}),
        },
        finish_reason: null,
      },
    ]);
    out += chunk([{ index: ch.index, delta: {}, finish_reason: ch.finish_reason ?? "stop" }]);
  }
  if (c.usage) out += chunk([], { usage: c.usage });
  out += "data: [DONE]\n\n";
  return new Response(out, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/**
 * A fetch for the chat model that records each completion's exact bytes into `calls`. Calls to a
 * model in `whole` are sent unstreamed, so its own TEE signs them, and replayed as a stream.
 */
export function capturingFetch(calls: Call[], whole: (model: string) => boolean): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/chat/completions") || typeof init?.body !== "string") return fetch(input, init);
    const req = JSON.parse(init.body) as { model: string; stream?: boolean; stream_options?: unknown };
    const unstream = Boolean(req.stream) && whole(req.model);
    if (unstream) {
      delete req.stream_options;
      req.stream = false;
    }
    const body = unstream ? JSON.stringify(req) : init.body;
    const headers = new Headers(init.headers);
    headers.set("accept-encoding", "identity");
    // The model id is part of what a model TEE signs: keep the one we asked for.
    headers.set("x-no-aliasing", "true");
    const res = await fetch(url, { ...init, body, headers });
    if (!res.ok || !res.body) return res;
    const call: Call = { model: req.model, request: enc.encode(body), response: new Uint8Array(), completionId: null };

    if (unstream) {
      const raw = new Uint8Array(await res.arrayBuffer());
      call.response = raw;
      call.completionId = idOf(raw, false);
      calls.push(call);
      return asStream(raw);
    }
    const parts: Uint8Array[] = [];
    const tee = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        parts.push(chunk);
        c.enqueue(chunk);
      },
      flush() {
        const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of parts) {
          all.set(p, o);
          o += p.length;
        }
        call.response = all;
        call.completionId = idOf(all, true);
        calls.push(call);
      },
    });
    return new Response(res.body.pipeThrough(tee), { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

// ─── Verify ─────────────────────────────────────────────────────────────────

const ATTESTATION_TTL_MS = 30 * 60_000;
let client: AttestationClient | null = null;
const api = () => (client ??= new AttestationClient({ apiKey: NEAR_AI_KEY }));
const tdx = () => createTdxQuoteVerifier();

let gateway: { at: number; p: Promise<VerifiedGatewayAttestation> } | null = null;
/** NEAR AI's gateway attestation, fetched with a fresh nonce and verified here; reused 30 minutes. */
function gatewayAttestation(): Promise<VerifiedGatewayAttestation> {
  if (gateway && Date.now() - gateway.at < ATTESTATION_TTL_MS) return gateway.p;
  const p = api()
    .fetchGatewayAttestation({ signingAlgo: "ecdsa" })
    .then((g) => verifyGatewayAttestation({ ...g, verifiers: { tdxQuote: tdx() } }));
  gateway = { at: Date.now(), p };
  p.catch(() => {
    if (gateway?.p === p) gateway = null;
  });
  return p;
}

const models = new Map<string, { at: number; p: Promise<VerifiedModelAttestation[]> }>();
/** The model TEE's attestations for a signer, verified here (TDX quote and NVIDIA GPU evidence); reused 30 minutes. */
function modelAttestations(model: string, address: string): Promise<VerifiedModelAttestation[]> {
  const key = `${model}|${address}`;
  const have = models.get(key);
  if (have && Date.now() - have.at < ATTESTATION_TTL_MS) return have.p;
  const p = (async () => {
    const fm = await api().fetchModelAttestations({ model, signingAlgo: "ecdsa", signingAddress: address });
    const ok: VerifiedModelAttestation[] = [];
    for (const a of fm.attestations) {
      ok.push(await verifyModelAttestation({ attestation: a, clientBinding: fm.clientBinding, verifiers: { tdxQuote: tdx(), gpuEvidence: createGpuEvidenceVerifier() } }));
    }
    return ok;
  })();
  models.set(key, { at: Date.now(), p });
  p.catch(() => models.delete(key));
  return p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The signature NEAR AI recorded for a completion; it can take a moment to appear. */
async function signatureOf(id: string): Promise<CompletionSignature> {
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await api().fetchCompletionSignature({ completionId: id, signingAlgo: "ecdsa" });
    } catch (e) {
      last = e;
      await sleep(1000 + i * 500);
    }
  }
  throw last instanceof Error ? last : new Error("No signature was published for this reply.");
}

async function verifyCall(call: Call): Promise<{ kind: "model" | "gateway"; signer: string; tcb: string; gpu?: string; id: string }> {
  if (!call.completionId) throw new Error("A model call came back without an id.");
  const sig = await signatureOf(call.completionId);
  const bytes = { requestBody: call.request, responseBody: call.response, signature: sig };
  if (sig.kind === "gateway") {
    const att = await gatewayAttestation();
    verifyGatewayResponse({ ...bytes, attestation: att });
    return { kind: "gateway", signer: att.signer.signingAddress, tcb: att.tcbStatus, id: call.completionId };
  }
  const verified = await modelAttestations(call.model, sig.signer.signingAddress);
  const match = findModelAttestationsForSignature({ attestations: verified, signature: sig });
  if (!match[0]) throw new Error("No verified attestation of this model matches its signature.");
  verifyModelResponse({ ...bytes, attestation: match[0] });
  return { kind: "model", signer: match[0].signer.signingAddress, tcb: match[0].tcbStatus, gpu: match[0].gpuEvidence, id: call.completionId };
}

const key = (conversation: string, message: string) => `verify:${conversation}:${message}`;
const KEEP_MS = 30 * 86_400_000;

export function storedVerification(conversation: string, message: string): Verification | null {
  return kv.get<Verification>(key(conversation, message));
}

export function markPending(conversation: string, message: string) {
  kv.set(key(conversation, message), { status: "pending" } satisfies Verification, KEEP_MS);
}

/** Checks every model call of one reply and stores the outcome for its badge. Never throws. */
export async function verifyReply(conversation: string, message: string, calls: Call[], tier: Tier | undefined): Promise<Verification> {
  let v: Verification;
  try {
    if (!calls.length) throw new Error("No model calls were recorded for this reply.");
    const done = await Promise.all(calls.map(verifyCall));
    const kinds = new Set(done.map((d) => d.kind));
    const strongest = done.find((d) => d.kind === "model") ?? done[0]!;
    v = {
      status: "verified",
      kind: kinds.size > 1 ? "mixed" : strongest.kind,
      tier,
      model: calls[0]!.model,
      calls: calls.length,
      signer: strongest.signer,
      tcb: strongest.tcb,
      gpu: strongest.gpu,
      completion_ids: done.map((d) => d.id),
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    v = { status: "failed", tier, model: calls[0]?.model, calls: calls.length, reason: (e as Error).message?.slice(0, 200), checked_at: new Date().toISOString() };
  }
  kv.set(key(conversation, message), v, KEEP_MS);
  return v;
}
