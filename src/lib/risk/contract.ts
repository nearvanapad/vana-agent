import { EXPLORER_ACCOUNT } from "../near/config";
import { contractHash, RpcError, tryView, viewAccessKeys, viewAccount, viewCode, type AccountView } from "../near/rpc";
import { decodeBase64, wasmExports } from "../near/wasm-exports";
import { ref } from "../sources/http";
import { byLevel, worst } from "./rules";
import type { Check, Launchpad, Level } from "./types";

/** What the chain says about the token account and its code. */
export type ContractFacts = {
  token: string;
  account: AccountView;
  code_hash: string | null;
  /** Account whose shared code this token follows; it can change the code for every token on it. */
  global_owner: string | null;
  full_access_keys: number;
  methods: string[];
  owner: { account: string; method: string } | null;
  source_link: string | null;
  as_of: string;
};

export class TokenNotFound extends Error {
  constructor(
    readonly token: string,
    why = "does not exist on NEAR mainnet",
  ) {
    super(`${token} ${why}. If that was a symbol, search for its contract first.`);
    this.name = "TokenNotFound";
  }
}

const OWNER_VIEWS = ["owner_id", "get_owner", "get_owner_id", "owner", "get_admin"];

/** Method-name patterns that give someone power over holders' tokens. */
const POWERS = [
  { key: "mint", re: /mint/i, text: "mint new tokens" },
  { key: "upgrade", re: /upgrade|update_contract|deploy|set_code|stage_code/i, text: "replace its code" },
  { key: "freeze", re: /blacklist|blocklist|freeze|(^|_)ban(_|$)|block_account|pause/i, text: "pause transfers or block accounts" },
  { key: "fee", re: /set_(transfer_)?(fee|tax)|update_(fee|tax)|tax_set/i, text: "change fees" },
] as const;

export type Power = (typeof POWERS)[number]["key"];

export function powers(methods: string[]): Partial<Record<Power, string[]>> {
  const out: Partial<Record<Power, string[]>> = {};
  for (const p of POWERS) {
    // views (is_*, get_*) only read state; the power is in the methods that change it
    const hits = methods.filter((m) => p.re.test(m) && !/^(is_|get_|view_|ft_metadata)/.test(m));
    if (hits.length) out[p.key] = hits;
  }
  return out;
}

export async function loadContract(token: string): Promise<ContractFacts> {
  let account: AccountView;
  try {
    account = await viewAccount(token);
  } catch (e) {
    if (e instanceof RpcError && e.kind === "UNKNOWN_ACCOUNT") throw new TokenNotFound(token);
    throw e;
  }
  const hash = contractHash(account);
  if (!hash) throw new TokenNotFound(token, "is a plain account with no contract, so it is not a token");
  const [keys, methods] = await Promise.all([
    viewAccessKeys(token),
    viewCode(token).then((c) => wasmExports(decodeBase64(c.code_base64))),
  ]);

  if (methods.length && !methods.includes("ft_metadata")) throw new TokenNotFound(token, "is a contract but not a NEP-141 token (no ft_metadata)");

  let owner: ContractFacts["owner"] = null;
  for (const m of OWNER_VIEWS.filter((m) => methods.includes(m))) {
    const v = await tryView<unknown>(token, m);
    if (typeof v === "string" && v) {
      owner = { account: v, method: m };
      break;
    }
  }

  let sourceLink: string | null = null;
  if (methods.includes("contract_source_metadata")) {
    const meta = await tryView<{ link?: string }>(token, "contract_source_metadata");
    sourceLink = meta?.link ?? null;
  }

  return {
    token,
    account,
    code_hash: hash,
    global_owner: account.global_contract_account_id ?? null,
    full_access_keys: keys.filter((k) => k.access_key.permission === "FullAccess").length,
    methods,
    owner,
    source_link: sourceLink,
    as_of: new Date().toISOString(),
  };
}

export function contractCheck(f: ContractFacts, opts: { verified: boolean; launchpad: Launchpad | null }): Check {
  const findings: Check["findings"] = [];
  const add = (level: Level, text: string) => findings.push({ level, text });
  const p = powers(f.methods);

  if (!f.code_hash) {
    add("red", "No contract is deployed on this account, so it is not a token.");
  } else {
    if (f.full_access_keys > 0) {
      add(
        opts.verified ? "yellow" : "red",
        `${f.full_access_keys} full-access key${f.full_access_keys > 1 ? "s" : ""} on the token account: the key holder can deploy new code and mint, freeze or drain.`,
      );
    } else {
      add("green", "No full-access keys: no one can deploy new code with a key.");
    }
    if (f.global_owner) {
      add("yellow", `Runs shared code owned by ${f.global_owner}, which can change it for every token on it.`);
    }
    if (opts.launchpad?.platform_upgradeable) {
      add("yellow", `The launchpad (${opts.launchpad.platform}) can upgrade the token or change its fee.`);
    }
    for (const def of POWERS) {
      const hits = p[def.key];
      if (!hits) continue;
      // already said above, in one line
      if (opts.launchpad?.platform_upgradeable && (def.key === "upgrade" || def.key === "fee")) continue;
      const who = f.owner ? `the owner (${f.owner.account})` : "an admin";
      add("yellow", `Has methods that let ${who} ${def.text}: ${hits.slice(0, 4).join(", ")}.`);
    }
    if (opts.verified) add("green", "Rhea lists it as a verified token.");
    if (f.source_link) add("green", `Publishes its source code: ${f.source_link}`);
  }

  const level = worst(findings.map((x) => x.level));
  const bad = findings.filter((x) => x.level === level && level !== "green");
  const summary =
    level === "green"
      ? "No keys and no mint, upgrade, freeze or fee methods."
      : bad.map((x) => x.text).join(" ");

  findings.sort(byLevel);
  return {
    id: "contract",
    title: "Contract",
    level,
    summary,
    findings,
    numbers: {
      code_hash: f.code_hash,
      shared_code_owner: f.global_owner,
      full_access_keys: f.full_access_keys,
      owner: f.owner?.account ?? null,
      powers: p,
      method_count: f.methods.length,
      verified_on_rhea: opts.verified,
      source_code: f.source_link,
    },
    sources: [ref("NEAR RPC", `${EXPLORER_ACCOUNT}${f.token}`, new Date(f.as_of))],
  };
}
