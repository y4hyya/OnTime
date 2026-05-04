"use client";

import { useEffect, useRef } from "react";
import {
  StreamingMessage,
  type AssistantMessage,
} from "@/components/chat/StreamingMessage";

export type ChatMessage =
  | { role: "user"; content: string }
  | AssistantMessage;

export function MessageList({ messages }: { messages: ChatMessage[] }) {
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
        <EmptyState />
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

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-3 text-center text-sm text-muted-foreground">
        <p>Tell us a flight you'd like to insure.</p>
        <p className="text-xs">
          Try{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
            Insure my TK1 tomorrow
          </span>{" "}
          or{" "}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
            What would BA117 cost on Friday?
          </span>
        </p>
      </div>
    </div>
  );
}
