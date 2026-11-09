# VANA — NEAR token agent

Chat agent for NEAR. Ask whether a NEP-141 token is safe and get a plain-language risk report where every number cites its source. Then swap it through NEAR Intents: between NEAR tokens, or across chains (BTC, ETH, SOL, USDC on Base, …), in and out of NEAR. The AI only reads. Your wallet signs every transaction.

> Built for NEAR HACKATHON, track **AI Security & Defense**: scam detection and wallet safeguards. Swaps across chains through NEAR Intents.

## Try it

Live at https://vana.nearvana.trade, on testnet by default. Each step says what to do and what you should see.

1. **Open `/app`, connect a testnet wallet and sign in.** You get a signature prompt, not a transaction. If the wallet holds 500,000 NVANA ([get it on NEARVANA](https://testnet.nearvana.trade/)), the chat unlocks. Swaps work without NVANA.
2. **Ask "is rug.vanarug4hgzsi.testnet safe?"** You get a red report: the dev's full-access key on the token, the dev keeps the pool's LP, and early buyers tie back to the dev. Every number cites its source.
3. **Look under the reply.** On the Private tier the badge reads "Verified · private". Tap it to see the signer, the Intel TDX status and the GPU check.
4. **Open the pane's Swap tab and swap 1 NEAR to NVANA.** You get a quote, then your wallet asks you to sign. The AI never signs.

## Built with

- **NEAR AI Cloud:** chat in TEEs, three privacy tiers, and every reply's signature and attestation verified (`src/lib/agent/verify.ts`).
- **NEAR Intents (1Click):** swaps between NEAR tokens and across chains, with deposit addresses for BTC, ETH, SOL and more (`src/lib/swap/service.ts`).
- **NEP-413:** wallet sign-in with nothing sent on chain (`src/lib/auth/nep413.ts`).
- **NEAR RPC, FastNEAR, NearBlocks, Rhea:** the chain data behind the seven checks (`src/lib/risk/`).

Safeguards:
- **The AI only reads.** Transactions are built from the stored proposal, never from model output.
- **Prompt-injection guard:** once a request reads stranger-written text (token names, symbols), the swap tool is off for the rest of that request (`src/lib/agent/guard.ts`).
- **Web Search results** are shown as quotes and never fed to the agent.

## Run

```sh
cp .env.example .env    # add LLM_API_KEY
pnpm install
pnpm dev                # http://localhost:3000 (landing), /app (the chat)
```

Or `docker compose up --build`.

Probe a contract: `pnpm probe <account>`. This prints the code hash, full-access keys and callable methods.

Probe the swap upstreams: `pnpm probe:intents`. This prints what a user pays at each fee setting and checks every cross-chain pair.

The chat runs on any OpenAI-compatible model. On NEAR AI Cloud (`LLM_BASE_URL=https://cloud-api.near.ai/v1`) the user picks how private it is:
- **Private:** open models on NEAR AI's own TEE GPUs, verifiable.
- **Partner:** larger open models in a partner's TEE.
- **Incognito:** OpenAI or Anthropic models through NEAR AI's TEE gateway.

Every reply on NEAR AI is verified: the server checks NEAR AI's signature of each model call against the exact request and response, and the attestation of the hardware that signed it (via `@nearai/inference-sdk`). A badge under the reply says what was proven: "Verified · private" when the Private model's own TEE signed it, "Signed" when NEAR AI's TEE gateway did.

Swaps reach NEAR Intents through one upstream, set by `INTENTS_PROVIDER`:
- `oneclick` (the default): 1Click directly.
- `aurora`: Aurora's Swap API, which fronts the same solvers.

Our fee is set server-side only. For 1Click it is `INTENTS_FEE_BPS` and `INTENTS_FEE_RECIPIENT`; for Aurora it is set per key in Aurora's portal. See `.env.example`.

## Deploy

Live at https://vana.nearvana.trade. `deploy/ship.sh` builds HEAD for linux/amd64, pushes it to `ghcr.io/nearvanapad/vana-agent` and runs it on the server, rolling back if it doesn't come up healthy. `TAG=<sha> deploy/ship.sh` redeploys an older image. Secrets live in the server's `.env` (see `deploy/env.example`); public build values in `deploy/build.env`.

## Data sources

NEAR RPC (FastNEAR), NearBlocks, FastNEAR API, Rhea (classic + DCL), NEAR Intents 1Click, nearly and justhoot launchpad contracts. Findings are in [docs/probes.md](docs/probes.md).

## License

MIT
