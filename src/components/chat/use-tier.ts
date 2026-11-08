"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Tier, TierInfo } from "@/lib/agent/model";

const KEY = "vana:tier";

/** What the server's AI offers: NEAR AI tiers (or null) and whether checks can search the web. */
export function useModels() {
  return useQuery({
    queryKey: ["model-tiers"],
    queryFn: async () => (await fetch("/api/models")).json() as Promise<{ tiers: TierInfo[] | null; default: Tier; webSearch?: boolean }>,
    staleTime: 5 * 60_000,
  });
}

/**
 * The NEAR AI model tier the user picked, remembered in this browser. Null tiers when the server
 * doesn't run on NEAR AI Cloud: then there is nothing to pick.
 */
export function useTier() {
  const q = useModels();
  const [picked, setPicked] = useState<Tier | null>(null);
  useEffect(() => {
    try {
      setPicked(localStorage.getItem(KEY) as Tier | null);
    } catch {
      /* storage blocked: the server's default applies */
    }
  }, []);
  const tiers = q.data?.tiers ?? null;
  const tier = tiers ? (tiers.some((t) => t.id === picked) ? picked! : q.data!.default) : undefined;
  const setTier = (t: Tier) => {
    setPicked(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* the pick still holds for this visit */
    }
  };
  return { tiers, tier, setTier };
}
