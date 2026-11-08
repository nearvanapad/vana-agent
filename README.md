# VANA — NEAR token agent

Chat agent for NEAR. Ask whether a NEP-141 token is safe and get a plain-language risk report where every number cites its source. Then swap it through NEAR Intents: between NEAR tokens, or across chains (BTC, ETH, SOL, USDC on Base, …), in and out of NEAR. The AI only reads. Your wallet signs every transaction.

> Work in progress for the NEAR Hackathon (Unstoppable DeFi · AI Security & Defense).

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
