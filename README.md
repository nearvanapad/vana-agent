# VANA — NEAR token agent

Chat agent for NEAR. Ask whether a NEP-141 token is safe and get a plain-language risk report where every number cites its source. Then swap it through NEAR Intents (1Click). The AI only reads. Your wallet signs every transaction.

> Work in progress for the NEAR Hackathon (Unstoppable DeFi · AI Security & Defense).

## Run

```sh
cp .env.example .env    # add LLM_API_KEY
pnpm install
pnpm dev                # http://localhost:3000
```

Or `docker compose up --build`.

Probe a contract: `pnpm probe <account>`. This prints the code hash, full-access keys and callable methods.

## Data sources

NEAR RPC (FastNEAR), NearBlocks, FastNEAR API, Rhea (classic + DCL), NEAR Intents 1Click, nearly and justhoot launchpad contracts. Findings are in [docs/probes.md](docs/probes.md).

## License

MIT
