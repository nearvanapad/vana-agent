"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { clsx } from "clsx";
import { Loader2, Menu, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session/use-session";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useUnlocked } from "@/components/gate/gate-card";
import { STICKER } from "@/components/ui/styles";
import { WalletPanel } from "@/components/wallet/connect-button";
import { NetworkSwitch } from "@/components/wallet/network-switch";
import Image from "next/image";
import Link from "next/link";
import { PaneProvider } from "@/components/pane/pane-context";
import { PaneDocked, PaneOverlay, PaneTabBar, PaneTabs } from "@/components/pane/pane";
import { ChatView } from "./chat-view";
import { ConversationList, type ConversationItem } from "./conversation-list";
import { Notice } from "./notice";
import vana from "./vana.gif";

/** The animated Vana mark next to the name. */
function Logo({ size }: { size: number }) {
  return <Image src={vana} alt="" width={size} height={size} unoptimized className="shrink-0" style={{ width: size, height: size }} />;
}

const newId = () => crypto.randomUUID();

const LAST = "vana:last-chat";

/** The chat this browser had open, so a reload brings it back. Storage can be blocked: then it is just forgotten. */
function remembered(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST, id);
    else localStorage.removeItem(LAST);
  } catch {}
}

/** The whole app: conversation list, the open chat, and the wallet. */
export function ChatApp() {
  const qc = useQueryClient();
  const session = useSession();
  // Ids made in this tab have no stored messages yet, so they are not fetched.
  const [local, setLocal] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    // A link names the chat; otherwise reopen the one this browser had open last.
    const fromUrl = new URLSearchParams(location.search).get("c");
    const last = remembered();
    if (fromUrl) setActive(fromUrl);
    else if (last) {
      setActive(last);
      history.replaceState(null, "", `?c=${last}`);
    } else {
      const id = newId();
      setLocal((s) => new Set(s).add(id));
      setActive(id);
    }
  }, []);

  const open = useCallback((id: string) => {
    setActive(id);
    setMenu(false);
    history.replaceState(null, "", `?c=${id}`);
    remember(id);
  }, []);

  const startNew = useCallback(() => {
    const id = newId();
    setLocal((s) => new Set(s).add(id));
    setActive(id);
    setMenu(false);
    history.replaceState(null, "", location.pathname);
    remember(null);
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

  const conversations = list.data?.conversations ?? [];
  const sidebar = (
    <>
      <div className="px-3 pt-1 pb-3">
        <button type="button" onClick={startNew} className={clsx(STICKER, "w-full gap-2 rounded-well px-3 py-[9px] text-sm")}>
          <Plus size={16} strokeWidth={2.2} /> New chat
        </button>
      </div>
      <ConversationList
        items={conversations}
        active={active ?? ""}
        onPick={(id) => (id === active ? setMenu(false) : open(id))}
        onDelete={(id) => remove.mutate(id)}
        signedIn={Boolean(session.account)}
      />
      <div className="border-t border-line p-3">
        <WalletPanel />
      </div>
    </>
  );

  const locked = useUnlocked() === false;
  const title = locked ? "Welcome" : (conversations.find((c) => c.id === active)?.title ?? "New chat");

  // Remember the URL of a new chat once its first message is sent.
  const onFirstSend = useCallback(() => {
    if (!active) return;
    history.replaceState(null, "", `?c=${active}`);
    remember(active);
  }, [active]);

  return (
    <PaneProvider key={active ?? "none"} conversationId={active}>
      <div className="flex h-dvh overflow-hidden text-[clamp(14px,calc(0.4vw+12.5px),15px)]">
        <aside className="hidden h-dvh w-66 shrink-0 flex-col border-r border-line bg-surface/40 md:flex">
          <h1 className="flex h-15 shrink-0 items-center pr-3 pl-4">
            <Link href="/" title="VANA home" className="flex items-center gap-2.5 rounded-[10px]">
              <Logo size={34} />
              <span className="font-display text-[22px] tracking-[0.04em] text-accent-deep">VANA</span>
            </Link>
          </h1>
          {sidebar}
        </aside>

        <Dialog.Root open={menu} onOpenChange={setMenu}>
          <Dialog.Portal>
            <Dialog.Overlay className="m-scrim fixed inset-0 z-40 bg-scrim md:hidden" />
            <Dialog.Content className="m-drawer-left fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col border-r border-line bg-bg shadow-[12px_0_32px_rgb(0_0_0/0.35)] md:hidden">
              <div className="flex h-15 shrink-0 items-center gap-2.5 pr-3 pl-4">
                <Dialog.Title className="flex flex-1 font-display text-[22px] tracking-[0.04em] text-accent-deep">
                  <Link href="/" title="VANA home" className="flex items-center gap-2.5 rounded-[10px]">
                    <Logo size={34} />
                    VANA
                  </Link>
                </Dialog.Title>
                <Dialog.Close className="grid size-10 place-items-center rounded-[10px] text-text-2 hover:bg-surface-2" aria-label="Close menu">
                  <X size={18} />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">Your conversations and your wallet</Dialog.Description>
              {sidebar}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* 60px tall: the pane drawer opens just under it. */}
          <header className="flex h-15 shrink-0 items-center justify-between gap-3 border-b border-line px-[clamp(12px,3vw,20px)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMenu(true)}
                className="-ml-2 flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] pr-2 pl-1.5 text-text-2 hover:bg-surface-2 md:hidden"
                aria-label="Open menu: chats and wallet"
              >
                <Menu size={20} />
                <Logo size={26} />
              </button>
              <span className="truncate text-[15px] font-medium" title={title}>
                {title}
              </span>
              <NetworkSwitch />
            </div>
            <div className="flex items-center gap-2">
              <PaneTabs />
              <ThemeToggle />
            </div>
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
          <PaneTabBar />
        </main>
        <PaneDocked />
        <PaneOverlay />
        <Notice />
      </div>
    </PaneProvider>
  );
}
