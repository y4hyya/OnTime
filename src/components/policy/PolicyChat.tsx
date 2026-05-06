"use client";

import { useCallback, useState } from "react";
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
  | { type: "tool-call"; id?: string; name: string; input: unknown }
  | {
      type: "tool-result";
      id?: string;
      name: string;
      result: unknown;
      isError: boolean;
    }
  | { type: "done" }
  | { type: "error"; message: string };

type Props = {
  policyId: string;
  status: string;
};

export function PolicyChat({ policyId, status }: Props) {
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
        const res = await fetch("/api/chat/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            policyId,
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
        if (event.type === "tool-call") {
          setMessages((prev) =>
            updateLastAssistant(prev, (m) => ({
              ...m,
              parts: [
                ...m.parts,
                {
                  type: "tool",
                  id: event.id,
                  name: event.name,
                  input: event.input,
                  pending: true,
                },
              ],
            })),
          );
          return;
        }
        if (event.type === "tool-result") {
          setMessages((prev) =>
            updateLastAssistant(prev, (m) => ({
              ...m,
              parts: m.parts.map<AssistantPart>((p) => {
                if (p.type !== "tool" || !p.pending) return p;
                if (p.id && event.id && p.id !== event.id) return p;
                if (!p.id && p.name !== event.name) return p;
                return {
                  ...p,
                  result: event.result,
                  isError: event.isError,
                  pending: false,
                };
              }),
            })),
          );
          return;
        }
        if (event.type === "error") {
          setError(event.message);
        }
      }
    },
    [messages, policyId],
  );

  return (
    <div className="flex flex-col rounded-lg border bg-background">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">Questions about this policy?</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ask the agent — it can explain payouts, tier triggers, and what
          happens next.
        </p>
      </div>
      <div className="min-h-[12rem] space-y-3 p-4">
        {messages.length === 0 ? (
          <PolicyChatEmptyState status={status} />
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
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
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

function PolicyChatEmptyState({ status }: { status: string }) {
  const examples =
    status === "paid_out"
      ? ["Why did I get this payout?", "When will the money arrive?"]
      : status === "claimable"
        ? [
            "Why is my flight claimable now?",
            "What if my flight delays more?",
          ]
        : ["Why isn't my flight claimable?", "What happens if it's delayed?"];

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>Try one of these:</p>
      {examples.map((q) => (
        <div
          key={q}
          className="rounded bg-muted px-2 py-1.5 font-mono text-xs"
        >
          {q}
        </div>
      ))}
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
