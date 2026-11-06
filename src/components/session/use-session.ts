"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Access } from "@/lib/gate/config";
import { signMessage } from "@/lib/near/wallet";

type SessionInfo = { account: string | null; access: Access };

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

/** The server session: a guest, or the wallet account that signed in. */
export function useSession() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: () => fetch("/api/session").then((r) => json<SessionInfo>(r)),
    staleTime: Infinity,
  });

  const done = (s: SessionInfo) => {
    qc.setQueryData(["session"], s);
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const signIn = useMutation({
    mutationFn: async () => {
      const c = await fetch("/api/session", { method: "POST", body: JSON.stringify({ step: "challenge" }) }).then((r) =>
        json<{ message: string; recipient: string; nonce: string }>(r),
      );
      const nonce = Uint8Array.from(atob(c.nonce), (ch) => ch.charCodeAt(0));
      const signed = await signMessage(c.message, c.recipient, nonce);
      return fetch("/api/session", {
        method: "POST",
        body: JSON.stringify({ step: "verify", ...signed, nonce: c.nonce }),
      }).then((r) => json<SessionInfo>(r));
    },
    onSuccess: done,
  });

  const signOut = useMutation({
    mutationFn: () => fetch("/api/session", { method: "DELETE" }).then((r) => json<SessionInfo>(r)),
    onSuccess: done,
  });

  // Reads the NVANA balance again, past the server's short cache (after buying some, say).
  const [rechecking, setRechecking] = useState(false);
  const recheck = useCallback(async () => {
    setRechecking(true);
    try {
      qc.setQueryData(["session"], await fetch("/api/session?fresh=1").then((r) => json<SessionInfo>(r)));
    } finally {
      setRechecking(false);
    }
  }, [qc]);

  return { ready: query.isSuccess, account: query.data?.account ?? null, access: query.data?.access ?? null, error: query.error, signIn, signOut, recheck, rechecking };
}
