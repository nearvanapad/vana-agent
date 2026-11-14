# VANA — NEAR token agent

VANA is an AI agent that checks NEAR tokens for scam risk and swaps them through chat. Ask "is this token safe?" and get a seven-check report, each check green, yellow or red with sourced numbers. The checks cover contract powers, holder concentration, bundled and sniper early buyers, fresh wallets, pullable liquidity, taxes and the creator's past launches. Then swap across chains with NEAR Intents. The chat runs on NEAR AI Cloud in TEEs, and every reply's signature and attestation is verified. The AI only reads: your wallet signs everything, and a prompt-injection guard blocks swaps once stranger-written text has been read.

Built at NEAR HACKATHON. Tracks:

- **AI Security & Defense** (`security`, primary): scam detection before you buy, an AI that can't sign, a prompt-injection guard, and TEE attestation checked on every reply.
- **Privacy & Private AI** (`privacy`): the chat runs on NEAR AI Cloud in TEEs, and the server verifies each reply's signature and the Intel TDX and GPU attestation behind it.
- **Unstoppable DeFi** (`defi`): a trading agent that swaps between NEAR tokens and across chains through NEAR Intents, with no custodian.

## Try it

Live at https://vana.nearvana.trade, on testnet by default (the header badge switches to mainnet). Each step says what to do and what you should see.

1. **Open `/app`, connect a testnet wallet and sign in.** You get a signature prompt, not a transaction. Any signed-in wallet can chat, up to 200 messages a day.
2. **Ask "is rug.vanarug4hgzsi.testnet safe?"** You get a red report: the dev's full-access key on the token, the dev keeps the pool's LP, and early buyers tie back to the dev. Every number cites its source.
3. **Look under the reply.** On the Private tier the badge reads "Verified · private". Tap it to see the signer, the Intel TDX status and the GPU check.
4. **Ask "swap 1 NEAR to nvana.nearvana2.nearvanapad.testnet".** VANA quotes it and runs the token check first, then asks you to decide. Reply "yes, swap it": an approval card with the quote appears in the pane, and your wallet asks you to sign. The AI never signs. The card can't appear in the same reply that read token names or symbols (the prompt-injection guard below), so a swap always takes your second message. The pane's Swap tab skips the chat and quotes straight away.
5. **No wallet needed for a cross-chain quote: pick mainnet with the header badge, open the pane's Swap tab and quote USDC on Base to NEAR.** You get a live NEAR Intents quote. Nothing is sent until a signed-in wallet approves it.

### Testnet and mainnet

NEAR Intents has no testnet, so what works depends on the network picked in the header:

| | Testnet | Mainnet |
|---|---|---|
| Token checks | Yes (they read both networks either way) | Yes |
| Swaps between NEAR tokens | Yes, through Rhea's testnet pools | Yes, through NEAR Intents, or Rhea when Intents has no route |
| Cross-chain swaps (BTC, ETH, SOL, …) | No | Yes, through NEAR Intents |
| Verified chat (NEAR AI Cloud) | Yes | Yes |


## Built with

- **NEAR AI Cloud:** chat in TEEs, three privacy tiers, and every reply's signature and attestation verified (`src/lib/agent/verify.ts`).
- **NEAR Intents:** through 1Click, or Aurora's Swap API in front of the same solvers (the live site uses Aurora; see `INTENTS_PROVIDER` below). Swaps between NEAR tokens and across chains, with deposit addresses for BTC, ETH, SOL and more, and status tracking through to success, refund or failure (`src/lib/swap/service.ts`).
- **NEP-413:** wallet sign-in with nothing sent on chain (`src/lib/auth/nep413.ts`).
- **Ethereum wallets (NEP-518):** `0x…` NEAR accounts connect through near-connect's Ethereum Wallets and sign in with Ethereum (EIP-4361 over `personal_sign`), checked on the server (`src/lib/auth/eth.ts`). Signing in needs a wallet in the browser: an extension on desktop, or the browser inside the MetaMask or Rabby app on a phone. Through WalletConnect it connects but can't sign in yet, so it can't swap here either. Their swaps go one action per transaction; if the wallet stops partway after the payment may have gone out, the swap is followed or flagged instead of offered again.
- **NEAR RPC, FastNEAR, NearBlocks, Rhea:** the chain data behind the seven checks (`src/lib/risk/`).
- **Installable (PWA):** "Install app" in the sidebar puts VANA on the home screen or desktop, opening straight into the chat. Chrome, Edge and Android get the browser's install dialog; iPhone, iPad and Safari get the steps to add it by hand (`src/lib/pwa/install.ts`, `public/sw.js`, `src/app/manifest.ts`).

Safeguards:
- **The AI only reads.** Transactions are built from the stored proposal, never from model output.
- **Prompt-injection guard:** once a request reads stranger-written text (token names, symbols), the swap tool is off for the rest of that request (`src/lib/agent/guard.ts`).
- **No deposit before the account can receive.** A swap paid from another chain into a NEAR token shows its deposit address only after the user's own wallet has registered the account on that token. An account without the NEAR to pay that registration, or one not on chain yet, is refused up front with how much NEAR to add. The server holds no keys and never pays it (`src/lib/swap/setup.ts`).
- **Web Search results** are shown as quotes and never fed to the agent.

Libraries: Next.js, React, the Vercel AI SDK, `@nearai/inference-sdk`, `@hot-labs/near-connect` (wallet connect), `near-api-js`, `@noble/curves` and `@noble/hashes` (Ethereum sign-in), TanStack Query, Radix UI, Tailwind CSS, zod, better-sqlite3. No starter template.

AI-written code: most of this repo was written with [Claude Code](https://claude.com/claude-code) (Anthropic), directed and tested by the team.

## What existed before the hackathon

This repo started on 2026-10-30, after the hackathon was announced. VANA is the hackathon work.

It was built alongside NEARVANA, our NEAR token launchpad (separate repo, started 2026-09-29), which existed before the hackathon. NEARVANA and its NVANA token are baseline, not part of this submission. VANA only reads the launchpad contracts (NEARVANA, nearly, justhoot) as data sources, and lists NVANA as one token you can swap.

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

Live at https://vana.nearvana.trade. Images are built for linux/amd64 and pushed to `ghcr.io/nearvanapad/vana-agent`, tagged with the commit; the server runs one with `deploy/compose.yml`. Secrets live in the server's `.env` (see `deploy/env.example`); public build values in `deploy/build.env`.

## Data sources

NEAR RPC (FastNEAR), NearBlocks, FastNEAR API, Rhea (classic + DCL), NEAR Intents 1Click, nearly and justhoot launchpad contracts. Findings are in [docs/probes.md](docs/probes.md).

## License

MIT
