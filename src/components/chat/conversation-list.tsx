"use client";

import { clsx } from "clsx";
import { MessageSquarePlus, Trash2 } from "lucide-react";

export type ConversationItem = { id: string; title: string; updated_at: number };

export function ConversationList(props: {
  items: ConversationItem[];
  active: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  signedIn: boolean;
}) {
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-2" aria-label="Conversations">
      <button
        type="button"
        onClick={props.onNew}
        className="flex items-center gap-2 rounded-well border border-line px-3 py-2 text-sm hover:bg-surface-2"
      >
        <MessageSquarePlus size={16} /> New chat
      </button>
      <ul className="flex-1 space-y-0.5 overflow-y-auto">
        {props.items.map((c) => (
          <li key={c.id} className="group relative">
            <button
              type="button"
              onClick={() => props.onPick(c.id)}
              className={clsx(
                "block w-full truncate rounded-well px-3 py-2 pr-8 text-left text-sm",
                c.id === props.active ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface-2/60 hover:text-text",
              )}
              title={c.title}
            >
              {c.title}
            </button>
            <button
              type="button"
              onClick={() => props.onDelete(c.id)}
              aria-label={`Delete “${c.title}”`}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-text-2 opacity-0 group-hover:opacity-100 hover:text-bad focus:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {props.items.length === 0 && <li className="px-3 py-2 text-xs text-text-2">No chats yet.</li>}
      </ul>
      <p className="px-1 text-xs text-text-2/80">
        {props.signedIn ? "Chats are kept under your wallet account." : "Connect your wallet and sign in to chat. Your chats are kept under your wallet account."}
      </p>
    </nav>
  );
}
