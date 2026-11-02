/**
 * Probe a contract: account state, keys, and exported methods.
 *   pnpm probe <account> [<account> ...]
 */
import { contractHash, viewAccessKeys, viewAccount, viewCode } from "../src/lib/near/rpc";
import { decodeBase64, wasmExports } from "../src/lib/near/wasm-exports";

for (const account of process.argv.slice(2)) {
  console.log(`\n=== ${account}`);
  const a = await viewAccount(account);
  console.log("code", contractHash(a), a.global_contract_hash ? "(global)" : "", "storage", a.storage_usage);
  const keys = await viewAccessKeys(account);
  console.log("full-access keys", keys.filter((k) => k.access_key.permission === "FullAccess").length, "of", keys.length);
  if (!contractHash(a)) continue;
  const { code_base64 } = await viewCode(account);
  console.log("methods:", wasmExports(decodeBase64(code_base64)).join(" "));
}
