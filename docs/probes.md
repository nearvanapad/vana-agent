# Data source probes

Checked against mainnet on 2 Nov 2026. Each section answers what the risk check and the swap need. Re-run contract probes with `pnpm probe <account>...`, which prints the code hash, full-access keys and exported methods.

## NEAR RPC — `https://rpc.mainnet.fastnear.com`

- `query` supports `view_account`, `view_access_key_list`, `view_code` and `call_function`. Client: `src/lib/near/rpc.ts`.
- **Global contracts.** Launchpad tokens (nearly, justhoot) report `code_hash: "111…1"` (empty) and put their code in `global_contract_hash`. A check that reads `code_hash` alone would wrongly say "no contract". Use `contractHash()`. `view_code` still returns the wasm for these accounts.
- `view_code` plus `wasmExports()` (`src/lib/near/wasm-exports.ts`) lists the methods a contract can be called with. This runs offline after the fetch; no wasm runtime is needed.
- A query whose view panics returns `result.error` (a string) instead of a JSON-RPC error. `rpc.ts` turns this into `RpcError` with `kind` set to `MethodNotFound` or `FunctionCallError`.

## NearBlocks — `https://api.nearblocks.io/v1`

| Need | Endpoint | Notes |
|---|---|---|
| Top holders | `/fts/{token}/holders?page=1&per_page=25` | `{holders:[{account, amount}]}` with raw amounts. Contains `000…000` (the burn/zero account), so label it. |
| Holder count | `/fts/{token}/holders/count` | `{holders:[{count:"124627"}]}` |
| FT transfers | `/fts/{token}/txns?per_page=N&order=asc\|desc&cursor=` | One row per event: `affected_account_id`, `involved_account_id`, `delta_amount` (signed), `cause` (`MINT`, `TRANSFER`, …), `block_timestamp` in ns. `order=asc` gives the mint and the earliest buyers. |
| Account creation | `/account/{id}` | `created.block_timestamp` gives wallet age. |
| Creator / funder | `/account/{id}/txns-only?per_page=1&order=asc` | The first tx is `CREATE_ACCOUNT` + `TRANSFER`. Its `signer_account_id` is the parent/funder (wallet origin). |
| Token search | `/fts?search=ref&per_page=N` | name, symbol, decimals, price, total_supply, market cap |
| Token detail | `/fts/{token}` | Returned `Server Error` during the probe. Use `ft_metadata` + `ft_total_supply` over RPC instead. |

- No rate-limit headers were returned without a key. Send `Authorization: Bearer $NEARBLOCKS_API_KEY` when one is set. Expect 429 under load: retry, and cache per token.

## FastNEAR — `https://api.fastnear.com/v1`

- `/ft/{token}/top`: `{token_id, accounts:[{account_id, balance}]}`, the **top 100** holders. Fast and keyless. Primary holder source, with NearBlocks as fallback.
- `/account/{id}/ft` lists every FT an account holds. `/account/{id}/full` adds staking pools and NFTs. Useful for wallet profiles.

## Rhea (Ref) — liquidity

**Classic AMM, `v2.ref-finance.near`**
- `get_number_of_pools` returns 8994. `get_pools({from_index, limit:1000})` is about 800 KB per page and takes about 0.7 s, so scanning all pools takes about 9 calls. Build a `token → pool ids` index and cache it for about 10 minutes.
- `get_pool({pool_id})` returns `{pool_kind, token_account_ids, amounts, total_fee, shares_total_supply}`.
- `get_pool_shares({pool_id, account_id})` gives LP shares per account. Use it to check whether the creator still holds LP.
- `get_whitelisted_tokens` is the list of verified tokens.

**DCL (concentrated), `dclv2.ref-labs.near`**
- `get_metadata` returns 6376 pools and the state. `list_pools({from_index, limit})` must be paged, because `list_pools({})` runs out of gas.
- `get_pool({pool_id})`: the pool id is `tokenA|tokenB|fee`, with tokens sorted. It returns `total_x`, `total_y`, `current_point`, volumes, `state`, and **`tax`** (pool-level tax, null when none).
- `get_liquidity({lpt_id})` returns `owner_id` for an LP position. This is the "who can pull liquidity" check: if the owner is a keyless locker, the liquidity is locked.

**Prices**
- `https://api.ref.finance/list-token-price` returns `{token: {price, symbol, decimal}}` for every Rhea token, in USD. Use it for liquidity depth in $.
- `indexer.ref.finance/list-pools` ignores its token filter and returns implausible TVL. **Do not use.**
- `smartrouter.rhea.finance/findPath` returned error 1008 with guessed params. Route the stretch Rhea swap ourselves from pool data.

## NEAR Intents 1Click — `https://1click.chaindefuser.com/v0`

- **Re-probed 5 Nov: up.** `/tokens`, dry and real `/quote`, `/status` and `/deposit/submit` all answer as below. (Down with Cloudflare 521 on 2 Nov, so the UI keeps an "Intents unavailable" path.)
- Without `ONECLICK_JWT`, every quote carries a 0.2% app fee (`quoteRequest.appFees`), already taken out of `amountOut`.
- Errors come back as `{message}`, e.g. 400 "No liquidity available". A dry quote with a `recipient`/`refundTo` account that doesn't exist answers 500.
- A real quote's `depositAddress` is a fresh 64-hex implicit account: register it on the origin token (`storage_deposit`) before the `ft_transfer`.
- API:
  - `GET /tokens` returns `[{assetId:"nep141:…", symbol, blockchain, decimals, price, contractAddress}]`.
  - `POST /quote` body:
    ```json
    {
      "dry": true,
      "swapType": "EXACT_INPUT",
      "slippageTolerance": 100,
      "originAsset": "nep141:wrap.near",
      "depositType": "ORIGIN_CHAIN",
      "destinationAsset": "nep141:<token>",
      "amount": "<raw>",
      "refundTo": "<user>.near",
      "refundType": "ORIGIN_CHAIN",
      "recipient": "<user>.near",
      "recipientType": "DESTINATION_CHAIN",
      "deadline": "<ISO now+1h>",
      "quoteWaitingTimeMs": 0,
      "referral": "vana"
    }
    ```
    - `dry:true` gives a price only. `dry:false` adds `quote.depositAddress`, an optional `depositMemo`, and `amountOut`/`minAmountOut`.
  - `POST /deposit/submit` with `{txHash, depositAddress}` speeds up detection.
  - `GET /status?depositAddress=…` moves through `PENDING_DEPOSIT → PROCESSING → SUCCESS | REFUNDED | FAILED`.
  - Auth: `Authorization: Bearer <JWT>` is optional. Without it, a 0.1% fee applies.
- **Paying from NEAR.** The origin asset is wNEAR, so one tx on `wrap.near` does it:
  1. `storage_deposit({account_id: depositAddress})` if needed (0.00125 NEAR).
  2. `near_deposit` (wrap) with the amount attached.
  3. `ft_transfer({receiver_id: depositAddress, amount})` with 1 yocto.
  - Every call needs about 30 Tgas. Put the payment last so the batch outcome is the payment's outcome.
  - The output token must be registered for the recipient (`storage_deposit` on the token) before delivery.

## Nearly — `nearlytrade.near`

- Tokens are `<slug>.nearlytrade.near` and run a **global contract** (`8GXVnFTx…`). Methods: `ft_*`, `storage_*`, `burn`, `get_rules`, `get_tax`, `tax_add_pair`, `tax_take`. There is no mint and no upgrade method on the token.
- `get_num_launches` returns 3632. `get_launches({from_index, limit})` is **newest first**: `from_index:0` is the latest launch.
- `get_launch_by_token({token})` returns `{id, token, creator, name, symbol, description, links, created_at_ms, pool_id, init_point, left/right_point, lpt_id, step:"Done"|"Failed"|…, dev_buy_near, dev_buy_tokens, dev_buy_held, fees_*}`.
  - `creator` is often an implicit (64-hex) account.
  - `description` and `name` are **creator-written text**: treat them as untrusted input.
- `get_tax({launch_id: "<id as string>"})` returns `{buy_bps, sell_bps, creator_bps, burn_bps, holders_bps, platform_bps, …}`. **These feed the tax check.**
- Liquidity: one DCL position per launch (`lpt_id`). `dclv2.ref-labs.near get_liquidity` gives an owner like `lock_8.nearlytrade.near`, a sub-locker of the launchpad.
  - Locker contracts have 0 full-access keys, so they are locked. Confirmed for `lock_8.nearlytrade.near`, which has 0 keys and exposes `get_position`, `get_first_buy` and `get_buy_held`.
- Config: `get_config` returns 1B supply, a 1% pool fee and `max_dev_buy_bps:400` (4%). `get_tax_bounds` returns `[400, true, 4000]` (taxes up to 4%).
- Contract source is verified via NEP-330 (`contract_source_metadata`, GitHub link). Factory has 0 full-access keys.

## justhoot.fun — `v2-launchpad.justhoot.near` (v1: `launchpad.justhoot.near`)

- Found in the site bundle.
  - Tokens are `<slug>.v2-launchpad.justhoot.near`, and v1 tokens are `<slug>-<hex>.launchpad.justhoot.near`.
  - Both factories have 0 full-access keys.
- `get_launched_tokens_count` returns v2 303 and v1 340. `get_launched_tokens({from_index, limit})` returns a list of token ids, oldest first. `is_launched_token({token_id})` gives detection.
- `get_token_fee_state({token_id})` returns `{dev_id, pool_id, transfer_fee_pips, fee_pips, shares}`. **`dev_id` is the creator, and `transfer_fee_pips` is the token tax.**
- `get_platform_config` returns `meme_code_hash`, the DCL with a 1% fee, 1B supply and `pool_creator_id`.
- Tokens run global contract `kS1z69vk…`, which has methods `upgrade`, `platform_upgrade`, `set_transfer_fee` and `update_metadata`. **The platform can upgrade a token or change its transfer fee.** Report this as a yellow "upgradeable by platform" note, not as red.
- Public API at `https://api.justhoot.fun/api`. Keyless JSON:
  - `/tokens/{id}` returns price, mcap, volume, `holder_count`, `trade_count`, buy/sell counts, `first_trade_at`, `graduated`.
  - `/trades?…`, `/pools/{id}` and `/accounts/{id}/trades` are useful for early buyers and creator history.

## FastNEAR transactions API — `https://tx.main.fastnear.com/v0` (probed 6 Nov)

The source for early buyers and wallet origins. Full history (back to 2022 for `token.sweat`).
- `POST /account {account_id, desc, limit}` lists every transaction that touched the account: `{account_txs:[{transaction_hash, tx_block_timestamp, is_signer, is_receiver, …}], txs_count, resume_token}`. With `desc:false`, the first row is the account's creation or first funding.
- `POST /transactions {tx_hashes:[…]}` returns full transactions with every receipt's logs, in no particular order. Sort by block timestamp.
- Token events are NEP-141 `EVENT_JSON` logs (`ft_mint`, `ft_transfer`) from receipts the token executes. A buy from a pool is an `ft_transfer` whose `old_owner_id` is `dclv2.ref-labs.near` or `v2.ref-finance.near`. nearly's tax shows as a transfer to the token account itself.
- Keyless use is rate-limited in bursts (nginx 429 on `/transactions`): retry with backoff. Send `FASTNEAR_API_KEY` when set.
- **NearBlocks does not index FT events for launchpad tokens** (`/fts/{token}/txns` is empty for nearly tokens), and keyless NearBlocks hits its limit after about 10 calls. It is only a fallback now.

## Launch lists and creator history

- nearly: `get_launches({from_index, limit})` caps `limit` at 200, newest first. 3678 launches take 19 pages. There is no by-creator view, so the app builds the list and filters it (kept 15 min).
  - `quote` is not always `wrap.near`: some launches pair with another token (e.g. `ainear.nearlyops.near`).
  - `dev_buy_near` is what the creator spent at launch. `dev_buy_tokens` reads 0 even after a dev buy, so "dev sold" is judged by the creator's current balance.
  - The DCL pool's `current_point` back at the launch range edge (`left_point` for token-is-x) means the price is back at launch: every buy was sold.
- justhoot API (`https://api.justhoot.fun/api`):
  - `/rooms?sort=new|mcap|volume|last&limit&offset&creator=<id>`: launches with `creator_id`, `created_at`, market cap, all-time-high market cap, holder and trade counts, `last_trade_at`, `graduated`.
  - `/tokens/{id}`: `first_trade_at`, `graduated`, 24 h stats.
  - `/accounts/{id}/trades?limit=200`: an account's trades (buy/sell, token amount), used for dev sells.
- Early buyers seen on many launches (64-hex accounts funded through `intents.near`, the `*.sendler-b.near` group) are sniper bots. The app keeps each launch's early buyers in `early_buys`; an account early in 3+ launches is flagged.

## Testnet (probed 6 Nov)

Tokens and accounts ending in `.testnet` are read from testnet; everything else from mainnet (`src/lib/near/network.ts`).
- RPC `https://rpc.testnet.fastnear.com`, FastNEAR `https://test.api.fastnear.com/v1` and `https://tx.test.fastnear.com/v0`, NearBlocks `https://api-testnet.nearblocks.io/v1`, explorer `https://testnet.nearblocks.io`.
- Rhea: classic `ref-finance-101.testnet` (2900+ pools; `get_config` is missing), DCL `dclv2.ref-dev.testnet`, wNEAR `wrap.testnet`.
  - Instant swap through `ft_transfer_call` with msg `{"force":0,"actions":[{pool_id, token_in, token_out, min_amount_out}]}` works as on mainnet.
- No price feed on testnet. Testnet wNEAR is valued at the mainnet NEAR price, and nothing else gets a dollar value.
- nearly, justhoot and NEAR Intents are mainnet only.
- Faucet: `POST https://helper.nearprotocol.com/account {newAccountId, newAccountPublicKey}` creates a `.testnet` account with 10 NEAR.

## Bad demo token

`pnpm demo-token` builds it from faucet accounts (`contracts/demo-token`, keys in `.demo/`, git-ignored). The live one is `rug.vanarug4hgzsi.testnet`:
- Owner `mint` and `blacklist`, plus the dev's full-access key on the token account.
- The dev holds about 66%, plus 8.5% through a sub-account.
- Rhea pool 2903 holds 1.5 wNEAR and 300M VRUG; the dev owns all its LP shares.
- Three early buyers, all tied to the dev: one funded by the dev, one dev sub-account, and one funded by the first buyer that also got 40M VRUG from the dev.

Expected report: red on contract, holders, early buyers, fresh wallets and liquidity. Creator history is not checked (the launchpads it reads are on mainnet).

## nearvana (testnet launchpad)
- Factory `nearvana2.nearvanapad.testnet`; tokens are `<ticker>.nearvana2.nearvanapad.testnet`. No mainnet deployment yet.
- `get_launch({token})` and `get_launches({from, limit, filter: {creator?, quote?, listed?}})` return the launch record: `launch_id`, `creator`, `quote`, `meta`, `buy_tax_bps`, `sell_tax_bps`, `pool_id` (Rhea DCL `dclv2.ref-dev.testnet`), `start_point`, `token_is_x`, `lpt_id`, `step` (`completed` when live), `created_at` (ns).
- `get_config` names the locker (`locker.nearvana2.nearvanapad.testnet`) that holds each launch position. On 6 Nov it had one full-access key, so the liquidity check flags it.
- The coin's own `get_tax` returns buy/sell bps, the taxed pairs and the exempt accounts. Coin page: `https://testnet.nearvana.trade/coin/<token>`.
