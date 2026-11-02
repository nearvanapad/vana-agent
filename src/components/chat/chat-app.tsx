"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { Loader2, Menu, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session/use-session";
import { ConnectButton } from "@/components/wallet/connect-button";
import { ChatView } from "./chat-view";
import { ConversationList, type ConversationItem } from "./conversation-list";

const newId = () => crypto.randomUUID();

/** The whole app: conversation list, the open chat, and the wallet. */
export function ChatApp() {
  const qc = useQueryClient();
  const session = useSession();
  // Ids made in this tab have no stored messages yet, so they are not fetched.
  const [local, setLocal] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get("c");
    if (fromUrl) setActive(fromUrl);
    else {
      const id = newId();
      setLocal((s) => new Set(s).add(id));
      setActive(id);
    }
  }, []);

  const open = useCallback((id: string) => {
    setActive(id);
    setMenu(false);
    history.replaceState(null, "", `?c=${id}`);
  }, []);

  const startNew = useCallback(() => {
    const id = newId();
    setLocal((s) => new Set(s).add(id));
    setActive(id);
    setMenu(false);
    history.replaceState(null, "", location.pathname);
  }, []);

  const list = useQuery({
    queryKey: ["conversations", session.account],
    queryFn: async () => (await (await fetch("/api/conversations")).json()) as { conversations: ConversationItem[] },
    enabled: session.ready,
  });

  const isLocal = active !== null && local.has(active);
  const thread = useQuery({
    queryKey: ["thread", active],
    queryFn: async () => {
      const r = await fetch(`/api/conversations/${active}`);
      if (r.status === 404) return { messages: [] as UIMessage[], missing: true };
      return { ...((await r.json()) as { messages: UIMessage[] }), missing: false };
    },
    enabled: session.ready && active !== null && !isLocal,
    staleTime: 0,
    gcTime: 0,
  });

  // A link to a chat that isn't ours (or is gone): start fresh.
  useEffect(() => {
    if (thread.data?.missing) startNew();
  }, [thread.data?.missing, startNew]);

  const remove = useMutation({
    mutationFn: (id: string) => fetch(`/api/conversations/${id}`, { method: "DELETE" }),
    onSuccess: (_r, id) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      if (id === active) startNew();
    },
  });

  const sidebar = (
    <ConversationList
      items={list.data?.conversations ?? []}
      active={active ?? ""}
      onPick={(id) => (id === active ? setMenu(false) : open(id))}
      onNew={startNew}
      onDelete={(id) => remove.mutate(id)}
      signedIn={Boolean(session.account)}
    />
  );

  // Remember the URL of a new chat once its first message is sent.
  const onFirstSend = useCallback(() => {
    if (active) history.replaceState(null, "", `?c=${active}`);
  }, [active]);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/40 p-3 md:flex">
        <h1 className="mb-4 px-1 pt-1 font-display text-2xl tracking-wide text-accent">VANA</h1>
        {sidebar}
      </aside>

      <Dialog.Root open={menu} onOpenChange={setMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-void/70 md:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-bg p-3 md:hidden">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="px-1 font-display text-2xl tracking-wide text-accent">VANA</Dialog.Title>
              <Dialog.Close className="rounded p-1.5 text-text-2 hover:bg-surface-2" aria-label="Close menu">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Your conversations</Dialog.Description>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col px-4">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-bg/95 py-3 backdrop-blur">
          <div className="flex items-center gap-2 md:invisible">
            <button type="button" onClick={() => setMenu(true)} className="rounded p-1.5 text-text-2 hover:bg-surface-2 md:hidden" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span className="font-display text-xl tracking-wide text-accent md:hidden">VANA</span>
          </div>
          <ConnectButton />
        </header>

        {active === null || (!isLocal && thread.isPending) ? (
          <div className="flex flex-1 items-center justify-center text-text-2">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <ChatView
            key={active}
            id={active}
            initial={isLocal ? [] : (thread.data?.messages ?? [])}
            account={session.account}
            ready={session.ready}
            onSend={onFirstSend}
          />
        )}
      </div>
    </div>
  );
}
