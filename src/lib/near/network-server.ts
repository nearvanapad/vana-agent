import { AsyncLocalStorage } from "node:async_hooks";
import { networkOf, setNetworkSource, type Network } from "./network";

const store = new AsyncLocalStorage<Network>();
setNetworkSource(() => store.getStore());

/** Runs `fn` reading `network`; everything it awaits sees the same network. */
export function onNetwork<T>(network: Network, fn: () => Promise<T>): Promise<T> {
  return store.run(network, fn);
}

/** Runs `fn` on the network `account` lives on. */
export const forAccount = <T>(account: string, fn: () => Promise<T>) => onNetwork(networkOf(account), fn);
