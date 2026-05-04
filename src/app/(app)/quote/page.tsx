"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Composer } from "@/components/chat/Composer";
import {
  MessageList,
  type ChatMessage,
} from "@/components/chat/MessageList";
import type {
  AssistantMessage,
  AssistantPart,
} from "@/components/chat/StreamingMessage";
import { TierTable } from "@/components/marketing/TierTable";
import { Button } from "@/components/ui/button";
import { createCheckoutSession } from "@/server/actions/quotes";

type Flight = {
  iata: string;
  origin: string;
  destination: string;
  scheduledDepAt: string;
};

type Pricing = {
  premiumDollars: string;
  payouts: Array<{
    tier: string;
    multiplier: number;
    payoutDollars: string;
  }>;
};

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

export default function QuotePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
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
        const res = await fetch("/api/chat/quote", {
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
          if (event.name === "lookup_flight" && !event.isError) {
            const r = event.result as {
              found?: boolean;
              flight?: Flight;
            };
            if (r.found && r.flight) setFlight(r.flight);
          }
          if (event.name === "run_pricing" && !event.isError) {
            const r = event.result as Pricing;
            if (r.premiumDollars && Array.isArray(r.payouts)) {
              setPricing(r);
            }
          }
          return;
        }
        if (event.type === "error") {
          setError(event.message);
        }
      }
    },
    [messages],
  );

  const hasQuote = flight !== null && pricing !== null;
  const [buying, setBuying] = useState(false);

  const onBuy = useCallback(async () => {
    if (!flight) return;
    setBuying(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession({
        iata: flight.iata,
        scheduledDepAt: flight.scheduledDepAt,
      });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBuying(false);
    }
  }, [flight]);

  return (
    <div className="flex flex-1 gap-6 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-background">
        <MessageList messages={messages} />
        {error && (
          <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Composer onSubmit={sendMessage} disabled={streaming || buying} />
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto lg:block">
        {hasQuote ? (
          <QuoteCard
            flight={flight}
            pricing={pricing}
            onBuy={onBuy}
            buying={buying}
          />
        ) : (
          <TierLadderCard />
        )}
      </aside>
    </div>
  );
}

function TierLadderCard() {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 text-sm font-medium">Tier ladder</h2>
      <TierTable />
      <p className="mt-3 text-xs text-muted-foreground">
        Multipliers are fixed for every policy. The premium varies based on the
        flight's risk.
      </p>
    </div>
  );
}

function QuoteCard({
  flight,
  pricing,
  onBuy,
  buying,
}: {
  flight: Flight;
  pricing: Pricing;
  onBuy: () => void;
  buying: boolean;
}) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <div className="text-xs text-muted-foreground">Flight</div>
        <div className="font-medium">
          {flight.iata} · {flight.origin} → {flight.destination}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {new Date(flight.scheduledDepAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Premium</div>
        <div className="text-3xl font-semibold tracking-tight">
          ${pricing.premiumDollars}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">Payouts if delayed</div>
        {pricing.payouts.map((p) => (
          <div key={p.tier} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{p.tier}</span>
            <span className="font-medium">${p.payoutDollars}</span>
          </div>
        ))}
      </div>
      <Button
        className="w-full"
        size="lg"
        onClick={onBuy}
        disabled={buying}
      >
        {buying ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Redirecting…
          </>
        ) : (
          "Buy this policy"
        )}
      </Button>
    </div>
  );
}

function flattenAssistant(m: AssistantMessage): string {
  return m.parts
    .filter((p): p is Extract<AssistantPart, { type: "text" }> => p.type === "text")
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

