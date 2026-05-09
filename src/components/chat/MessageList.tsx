"use client";

import { useEffect, useRef } from "react";
import {
  StreamingMessage,
  type AssistantMessage,
} from "@/components/chat/StreamingMessage";

export type ChatMessage =
  | { role: "user"; content: string }
  | AssistantMessage;

const EXAMPLES = [
  "Insure my TK1 tomorrow",
  "What would BA117 cost on Friday?",
] as const;

export function MessageList({
  messages,
  onPickExample,
}: {
  messages: ChatMessage[];
  onPickExample?: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6"
    >
      {messages.length === 0 ? (
        <EmptyState onPick={onPickExample} />
      ) : (
        messages.map((m, i) =>
          m.role === "user" ? (
            <UserBubble key={i} content={m.content} />
          ) : (
            <StreamingMessage key={i} message={m} />
          ),
        )
      )}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
        {content}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick?: (text: string) => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-4 text-center text-sm text-muted-foreground">
        <p>Tell us a flight you&apos;d like to insure.</p>
        <div className="flex flex-col items-center gap-2">
          {EXAMPLES.map((q) =>
            onPick ? (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                className="rounded border bg-background px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-muted"
              >
                {q}
              </button>
            ) : (
              <span
                key={q}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
              >
                {q}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
