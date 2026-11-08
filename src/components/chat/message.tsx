"use client";

import type { UIMessage } from "ai";
import { Brain } from "lucide-react";
import { Md } from "./markdown";
import { ToolPart, type ToolPartLike } from "./tool-part";
import { VerifyBadge } from "./verify-badge";

/** One chat message. `conversationId` and `done` show the verification badge under a finished reply. */
export function Message({ message, conversationId, done, latest }: { message: UIMessage; conversationId?: string; done?: boolean; latest?: boolean }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card rounded-br-md bg-bubble px-4 py-2.5 whitespace-pre-wrap break-words text-text">{text}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message.parts.map((p, i) => {
        const key = `${message.id}-${i}`;
        if (p.type === "text") return p.text ? <Md key={key} text={p.text} /> : null;
        if (p.type === "reasoning") {
          if (!p.text.trim()) return null;
          return (
            <details key={key} className="text-sm text-text-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 hover:text-text">
                <Brain size={14} /> Reasoning
              </summary>
              <div className="mt-2 border-l-2 border-line pl-3 whitespace-pre-wrap">{p.text}</div>
            </details>
          );
        }
        if (p.type.startsWith("tool-")) return <ToolPart key={key} part={p as unknown as ToolPartLike} />;
        return null;
      })}
      {done && conversationId && <VerifyBadge conversationId={conversationId} messageId={message.id} latest={latest} />}
    </div>
  );
}
