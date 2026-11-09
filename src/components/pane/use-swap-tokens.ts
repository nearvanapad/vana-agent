"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { WALLET } from "@/lib/near/network";
import type { SwapToken, SwapTokenList } from "@/lib/swap/tokens";

export type { SwapToken };

const KEY = `vana:swap-tokens:${WALLET.id}`;
const FRESH_MS = 5 * 60_000;

type Saved = { at: number; list: SwapTokenList };

function saved(): Saved | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The tokens the swap form can pick from. The last list is kept in the browser, so the picker
 * opens at once; it is refetched when older than 5 minutes.
 */
export function useSwapTokens() {
  const q = useQuery({
    queryKey: ["swap-tokens", WALLET.id],
    queryFn: async (): Promise<SwapTokenList> => {
      const r = await fetch(`/api/swap/tokens?network=${WALLET.id}`);
      if (!r.ok) throw new Error(`Token list failed (${r.status})`);
      return (await r.json()) as SwapTokenList;
    },
    initialData: () => saved()?.list,
    initialDataUpdatedAt: () => saved()?.at,
    staleTime: FRESH_MS,
    retry: 1,
  });

  useEffect(() => {
    if (!q.data || q.isFetching) return;
    try {
      if (saved()?.list.built_at !== q.data.built_at) localStorage.setItem(KEY, JSON.stringify({ at: q.dataUpdatedAt, list: q.data } satisfies Saved));
    } catch {
      /* storage full or blocked: the list still works for this visit */
    }
  }, [q.data, q.dataUpdatedAt, q.isFetching]);

  const tokens = useMemo(() => q.data?.tokens ?? [], [q.data]);
  const byId = useMemo(() => new Map(tokens.map((t) => [t.token, t])), [tokens]);
  return { tokens, byId, loading: q.isPending, error: q.error };
}
