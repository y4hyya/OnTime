"use client";

import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

export type AssistantPart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      id?: string;
      name: string;
      input: unknown;
      result?: unknown;
      isError?: boolean;
      pending: boolean;
    };

export type AssistantMessage = {
  role: "assistant";
  parts: AssistantPart[];
};

export function StreamingMessage({ message }: { message: AssistantMessage }) {
  return (
    <div className="space-y-2 text-sm">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.text) return null;
          return (
            <div key={i} className="whitespace-pre-wrap leading-relaxed">
              {part.text}
            </div>
          );
        }
        return <ToolIndicator key={i} part={part} />;
      })}
    </div>
  );
}

function ToolIndicator({
  part,
}: {
  part: Extract<AssistantPart, { type: "tool" }>;
}) {
  const label = labelForTool(part.name, part.input);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      {part.pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : part.isError ? (
        <CircleAlert className="size-3.5 text-destructive" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      <span className={part.isError ? "text-destructive" : ""}>{label}</span>
    </div>
  );
}

function labelForTool(name: string, input: unknown): string {
  if (name === "lookup_flight") {
    const i = input as { iata?: string; date?: string };
    const flight = i.iata ?? "flight";
    return i.date ? `Looking up ${flight} on ${i.date}` : `Looking up ${flight}`;
  }
  if (name === "run_pricing") {
    return "Calculating premium";
  }
  if (name === "get_policy") {
    return "Looking up your policy";
  }
  return `Calling ${name}`;
}
