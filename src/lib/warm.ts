import { MAINNET, TESTNET } from "./near/network";
import { onNetwork } from "./near/network-server";
import { warmIndex } from "./risk/bundle";
import { allLaunches } from "./risk/launchpad/nearly";
import { allLaunches as nearvanaLaunches } from "./risk/launchpad/nearvana";
import { prices, warmPools, whitelist } from "./sources/rhea";

/**
 * Loads the slow shared data before anyone asks: both networks' Rhea pool lists, prices, the
 * verified list, the launch lists (nearly, nearvana) and both sniper indexes. Then keeps the pool lists and the launch
 * list fresh, so no question waits on a cold cache.
 */

const EVERY_MS = 3 * 60_000;

async function once(): Promise<void> {
  const started = Date.now();
  const jobs: [string, () => Promise<unknown>][] = [
    ["mainnet pools", () => onNetwork(MAINNET, warmPools)],
    ["testnet pools", () => onNetwork(TESTNET, warmPools)],
    ["prices", () => prices()],
    ["verified list", () => onNetwork(MAINNET, () => whitelist())],
    ["nearly launches", () => onNetwork(MAINNET, allLaunches)],
    ["nearvana launches", () => onNetwork(TESTNET, nearvanaLaunches)],
    ["sniper index", () => onNetwork(MAINNET, warmIndex)],
    ["testnet sniper index", () => onNetwork(TESTNET, warmIndex)],
  ];
  const results = await Promise.allSettled(jobs.map(([, run]) => run()));
  const failed = jobs.filter((_, i) => results[i]!.status === "rejected").map(([name]) => name);
  console.log(`warm-up done in ${Math.round((Date.now() - started) / 1000)}s${failed.length ? `; failed: ${failed.join(", ")}` : ""}`);
}

let started = false;

export function warmUp(): void {
  if (started) return;
  started = true;
  void once();
  setInterval(() => void once(), EVERY_MS).unref();
}
