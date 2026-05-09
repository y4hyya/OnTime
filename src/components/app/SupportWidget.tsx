"use client";

import { useCallback, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/chat/Composer";
import { StreamingMessage } from "@/components/chat/StreamingMessage";
import type {
  AssistantMessage,
  AssistantPart,
} from "@/components/chat/StreamingMessage";

type ChatMessage =
  | { role: "user"; content: string }
  | AssistantMessage;

type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

const EXAMPLES = [
  "How does OnTime work?",
  "Why is there a 2-hour cutoff?",
  "When does my payout arrive?",
];

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = { role: "user", content: text };
      const placeholder: AssistantMessage = { role: "assistant", parts: [] };
      const nextHistory: ChatMessage[] = [...messages, userMessage];

      setMessages([...nextHistory, placeholder]);
      setStreaming(true);
      setError(null);

      try {
        const res = await fetch("/api/chat/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextHistory.map((m) => ({
              role: m.role,
              content: m.role === "user" ? m.content : flattenAssistant(m),
            })),
          }),
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => res.statusText);
          throw new Error(`HTTP ${res.status}: ${body}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            handleEvent(JSON.parse(line) as StreamEvent);
          }
        }
        if (buffer.trim()) {
          handleEvent(JSON.parse(buffer) as StreamEvent);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStreaming(false);
      }

      function handleEvent(event: StreamEvent) {
        if (event.type === "text-delta") {
          setMessages((prev) =>
            updateLastAssistant(prev, (m) => appendText(m, event.text)),
          );
          return;
        }
        if (event.type === "error") {
          setError(event.message);
        }
      }
    },
    [messages],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Ask OnTime support"
      >
        <MessageCircle className="size-4" />
        Ask OnTime
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-3rem)] flex-col rounded-lg border bg-background shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Ask OnTime</h2>
          <p className="text-xs text-muted-foreground">
            Product questions, fast answers.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.length === 0 ? (
          <EmptyState onPick={sendMessage} />
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

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <Composer onSubmit={sendMessage} disabled={streaming} />
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

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-2 text-muted-foreground">
      <p className="text-xs">Try one of these:</p>
      <div className="flex flex-col gap-1.5">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function flattenAssistant(m: AssistantMessage): string {
  return m.parts
    .filter(
      (p): p is Extract<AssistantPart, { type: "text" }> => p.type === "text",
    )
    .map((p) => p.text)
    .join("");
}

function appendText(m: AssistantMessage, delta: string): AssistantMessage {
  const last = m.parts[m.parts.length - 1];
  if (last && last.type === "text") {
    const updated = { type: "text" as const, text: last.text + delta };
    return { ...m, parts: [...m.parts.slice(0, -1), updated] };
  }
  return { ...m, parts: [...m.parts, { type: "text", text: delta }] };
}

function updateLastAssistant(
  messages: ChatMessage[],
  update: (m: AssistantMessage) => AssistantMessage,
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      const next = [...messages];
      next[i] = update(m);
      return next;
    }
  }
  return messages;
}
