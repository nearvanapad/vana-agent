/**
 * Builds the bad demo token on testnet, so the risk check has something to catch:
 *   pnpm demo-token            create everything that doesn't exist yet (safe to re-run)
 *   pnpm demo-token status     print the accounts and what the risk check should flag
 *
 * Every account is new and funded by the testnet faucet. Keys are kept in `.demo/` (git-ignored).
 * Build the contract first: `cd contracts/demo-token && cargo near build non-reproducible-wasm`.
 *
 * What it sets up:
 * - dev: a faucet account that owns everything.
 * - rug.<dev>: the token (1B supply to the dev), with owner mint and blacklist methods, and the
 *   dev's full-access key left on it.
 * - A Rhea classic pool (token / wNEAR) with a little liquidity, whose LP shares the dev keeps.
 * - Three early buyers that buy seconds after the pool opens, all tied to the dev:
 *   one funded by the dev, one a dev sub-account, and one funded by the first buyer that also
 *   gets coins straight from the dev.
 */
import { Account, actions as actionsOf, JsonRpcProvider, KeyPair, type KeyPairString } from "near-api-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RPC = process.env.NEAR_TESTNET_RPC_URL ?? "https://rpc.testnet.fastnear.com";
const FAUCET = "https://helper.nearprotocol.com/account";
const REF = "ref-finance-101.testnet";
const WRAP = "wrap.testnet";
const WASM = resolve("contracts/demo-token/target/near/vana_demo_token.wasm");
const STATE = resolve(".demo/demo-token.json");

const NEAR = 10n ** 24n;
const near = (n: number) => (BigInt(Math.round(n * 1000)) * NEAR) / 1000n;
const TOKEN = 10n ** 18n;
const SUPPLY = 1_000_000_000n * TOKEN;
const TGAS = 10n ** 12n;

type Saved = { id: string; key: KeyPairString };
type State = {
  stamp: string;
  dev?: Saved;
  extra?: Saved;
  token?: string;
  pool_id?: number;
  buyers: Saved[];
  bought: string[];
  sent?: boolean;
};

const provider = new JsonRpcProvider({ url: RPC });

function load(): State {
  if (existsSync(STATE)) return JSON.parse(readFileSync(STATE, "utf8")) as State;
  return { stamp: Date.now().toString(36).slice(-6), buyers: [], bought: [] };
}

function save(s: State) {
  mkdirSync(resolve(".demo"), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

const account = (a: Saved) => new Account(a.id, provider, a.key);

async function exists(id: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId: id, finality: "final" } as never);
    return true;
  } catch {
    return false;
  }
}

async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A new testnet account with 10 NEAR from the faucet. */
async function fromFaucet(id: string): Promise<Saved> {
  const kp = KeyPair.fromRandom("ed25519");
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`faucet ${res.status}: ${(await res.text()).slice(0, 200)}`);
  for (let i = 0; i < 20 && !(await exists(id)); i++) await sleep(1500);
  console.log(`  faucet → ${id}`);
  return { id, key: kp.toString() as KeyPairString };
}

async function call(from: Account, contractId: string, methodName: string, args: Record<string, unknown>, deposit = 0n, tgas = 30n) {
  return from.callFunctionRaw({ contractId, methodName, args, deposit, gas: tgas * TGAS });
}

async function main() {
  const s = load();
  const tag = `vanarug${s.stamp}`;

  // 1. The dev, and a second faucet account that tops it up.
  if (!s.dev) {
    s.dev = await fromFaucet(`${tag}.testnet`);
    save(s);
  }
  if (!s.extra) {
    s.extra = await fromFaucet(`${tag}-fund.testnet`);
    save(s);
    await account(s.extra).transfer({ receiverId: s.dev.id, amount: near(9.5) });
    console.log(`  topped up ${s.dev.id} from ${s.extra.id}`);
  }
  const dev = account(s.dev);

  // 2. The token: a dev sub-account with the dev's key on it.
  const token = (s.token ??= `rug.${s.dev.id}`);
  if (!(await exists(token))) {
    if (!existsSync(WASM)) throw new Error(`missing ${WASM}: build the contract first`);
    await dev.signAndSendTransaction({
      receiverId: token,
      actions: [
        actionsOf.createAccount(),
        actionsOf.transfer(near(2.2)),
        actionsOf.addFullAccessKey(KeyPair.fromString(s.dev.key).getPublicKey()),
        actionsOf.deployContract(readFileSync(WASM)),
        actionsOf.functionCall(
          "new",
          { owner_id: s.dev.id, total_supply: SUPPLY.toString(), name: "Vana Demo Rug", symbol: "VRUG" },
          30n * TGAS,
          0n,
        ),
      ],
    });
    console.log(`  deployed ${token}`);
    save(s);
  }

  // 3. A Rhea pool with a little liquidity; the dev keeps the LP shares.
  const tokenReg = BigInt((await view<{ min: string }>(token, "storage_balance_bounds")).min);
  const wrapReg = BigInt((await view<{ min: string }>(WRAP, "storage_balance_bounds")).min);
  if (s.pool_id === undefined) {
    await call(dev, token, "storage_deposit", { account_id: REF, registration_only: true }, tokenReg);
    await call(dev, WRAP, "storage_deposit", { account_id: s.dev.id, registration_only: true }, wrapReg);
    await call(dev, REF, "storage_deposit", { account_id: s.dev.id, registration_only: false }, near(0.1));
    await call(dev, REF, "register_tokens", { token_ids: [token, WRAP] }, 1n);
    await call(dev, WRAP, "near_deposit", {}, near(1.5));
    await call(dev, WRAP, "ft_transfer_call", { receiver_id: REF, amount: near(1.5).toString(), msg: "" }, 1n, 100n);
    const inPool = 300_000_000n * TOKEN;
    await call(dev, token, "ft_transfer_call", { receiver_id: REF, amount: inPool.toString(), msg: "" }, 1n, 100n);
    const r = await dev.callFunction<number>({
      contractId: REF,
      methodName: "add_simple_pool",
      args: { tokens: [token, WRAP], fee: 30 },
      deposit: near(0.01),
      gas: 30n * TGAS,
    });
    s.pool_id = Number(r);
    save(s);
    await call(dev, REF, "add_liquidity", { pool_id: s.pool_id, amounts: [inPool.toString(), near(1.5).toString()] }, near(0.01), 100n);
    console.log(`  pool ${s.pool_id} opened with 300M VRUG and 1.5 wNEAR`);
  }

  // 4. The buyers, created before the buys so the buys land seconds apart.
  if (s.buyers.length < 3) {
    const b1: Saved = { id: `${tag}-a.testnet`, key: KeyPair.fromRandom("ed25519").toString() as KeyPairString };
    const b2: Saved = { id: `w2.${s.dev.id}`, key: KeyPair.fromRandom("ed25519").toString() as KeyPairString };
    const b3: Saved = { id: `${tag}-b.testnet`, key: KeyPair.fromRandom("ed25519").toString() as KeyPairString };
    const pub = (a: Saved) => KeyPair.fromString(a.key).getPublicKey().toString();
    // Funded by the dev, through the testnet registrar.
    await call(dev, "testnet", "create_account", { new_account_id: b1.id, new_public_key: pub(b1) }, near(2.2), 50n);
    // A sub-account of the dev.
    await dev.createAccount({ newAccountId: b2.id, publicKey: pub(b2), nearToTransfer: near(1.2) });
    // Funded by the first buyer.
    await call(account(b1), "testnet", "create_account", { new_account_id: b3.id, new_public_key: pub(b3) }, near(1.0), 50n);
    s.buyers = [b1, b2, b3];
    save(s);
    console.log(`  buyers ${s.buyers.map((b) => b.id).join(", ")}`);
  }

  // 5. Each buyer registers, wraps and buys through the pool.
  await Promise.all(
    s.buyers.map(async (b) => {
      if (s.bought.includes(b.id)) return;
      const a = account(b);
      await call(a, token, "storage_deposit", { account_id: b.id, registration_only: true }, tokenReg);
      await call(a, WRAP, "storage_deposit", { account_id: b.id, registration_only: true }, wrapReg);
      await call(a, WRAP, "near_deposit", {}, near(0.6));
      const msg = JSON.stringify({ force: 0, actions: [{ pool_id: s.pool_id, token_in: WRAP, token_out: token, min_amount_out: "0" }] });
      await call(a, WRAP, "ft_transfer_call", { receiver_id: REF, amount: near(0.6).toString(), msg }, 1n, 180n);
      s.bought.push(b.id);
      console.log(`  ${b.id} bought`);
    }),
  );
  save(s);

  // 6. The dev slips coins to the last buyer.
  if (!s.sent) {
    await call(dev, token, "ft_transfer", { receiver_id: s.buyers[2]!.id, amount: (40_000_000n * TOKEN).toString() }, 1n);
    s.sent = true;
    save(s);
    console.log(`  dev sent 40M VRUG to ${s.buyers[2]!.id}`);
  }
  await status(s);
}

async function status(s = load()) {
  if (!s.token) return console.log("Nothing deployed yet. Run: pnpm demo-token");
  const bal = async (a: string) => Number(BigInt(await view<string>(s.token!, "ft_balance_of", { account_id: a })) / TOKEN) / 1e6;
  console.log(`\ntoken  ${s.token}   pool ${s.pool_id} on ${REF}`);
  console.log(`dev    ${s.dev!.id}   ${await bal(s.dev!.id)}M VRUG`);
  for (const b of s.buyers) console.log(`buyer  ${b.id}   ${await bal(b.id)}M VRUG`);
  console.log(`\nAsk VANA: "is ${s.token} safe?"`);
}


if (process.argv[2] === "status") await status();
else await main();
