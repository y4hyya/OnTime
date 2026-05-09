import { auth } from "@clerk/nextjs/server";
import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  GenerateContentResponseUsageMetadata,
  Part,
} from "@google/genai";
import { getGoogleAI, QUOTE_AGENT_MODEL } from "@/lib/ai/client";
import { CLAIM_AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts/claim-agent";
import {
  createGetPolicyHandler,
  getPolicyTool,
} from "@/lib/ai/tools/get-policy";
import {
  lookupFlightTool,
  lookupFlightHandler,
} from "@/lib/ai/tools/lookup-flight";
import { db } from "@/lib/db/client";
import { chatSessions } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  getPolicyTool,
  lookupFlightTool,
];

const MAX_TURNS = 8;

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { policyId?: string; messages?: IncomingMessage[] };
  try {
    payload = (await req.json()) as {
      policyId?: string;
      messages?: IncomingMessage[];
    };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const policyId = payload.policyId;
  if (!policyId || typeof policyId !== "string") {
    return new Response("policyId required", { status: 400 });
  }

  const incoming = payload.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return new Response("messages array required", { status: 400 });
  }

  const conversation: Content[] = incoming.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const handlers: Record<
    string,
    (input: unknown) => unknown | Promise<unknown>
  > = {
    get_policy: createGetPolicyHandler(userId, policyId),
    lookup_flight: lookupFlightHandler,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const ai = getGoogleAI();
        const systemInstruction = `${CLAIM_AGENT_SYSTEM_PROMPT}\n\nCurrent UTC date/time: ${new Date().toISOString()}`;

        let totalPromptTokens = 0;
        let totalOutputTokens = 0;
        let totalCachedTokens = 0;

        let turn = 0;
        while (turn++ < MAX_TURNS) {
          const apiStream = await ai.models.generateContentStream({
            model: QUOTE_AGENT_MODEL,
            contents: conversation,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
              maxOutputTokens: 1024,
            },
          });

          let bufferedText = "";
          const toolCalls: FunctionCall[] = [];
          let lastUsage: GenerateContentResponseUsageMetadata | undefined;

          for await (const chunk of apiStream) {
            if (chunk.text) {
              bufferedText += chunk.text;
              send({ type: "text-delta", text: chunk.text });
            }
            if (chunk.functionCalls) {
              for (const fc of chunk.functionCalls) toolCalls.push(fc);
            }
            if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
          }

          if (lastUsage) {
            totalPromptTokens += lastUsage.promptTokenCount ?? 0;
            totalOutputTokens += lastUsage.candidatesTokenCount ?? 0;
            totalCachedTokens += lastUsage.cachedContentTokenCount ?? 0;
          }

          const modelParts: Part[] = [];
          if (bufferedText.length > 0) {
            modelParts.push({ text: bufferedText });
          }
          for (const fc of toolCalls) {
            modelParts.push({ functionCall: fc });
          }
          if (modelParts.length === 0) break;
          conversation.push({ role: "model", parts: modelParts });

          if (toolCalls.length === 0) break;

          const toolResponseParts: Part[] = [];
          for (const fc of toolCalls) {
            const name = fc.name ?? "";
            const args = fc.args ?? {};
            send({ type: "tool-call", id: fc.id, name, input: args });

            const handler = handlers[name];
            let result: unknown;
            let isError = false;
            try {
              if (!handler) throw new Error(`Unknown tool: ${name}`);
              result = await handler(args);
            } catch (e) {
              isError = true;
              result = {
                error: e instanceof Error ? e.message : String(e),
              };
            }
            send({
              type: "tool-result",
              id: fc.id,
              name,
              result,
              isError,
            });

            const response: Record<string, unknown> = isError
              ? { error: (result as { error: string }).error }
              : { output: result };
            toolResponseParts.push({
              functionResponse: {
                ...(fc.id ? { id: fc.id } : {}),
                name,
                response,
              },
            });
          }
          conversation.push({ role: "user", parts: toolResponseParts });
        }

        await db.insert(chatSessions).values({
          userClerkId: userId,
          agentType: "claim",
          messagesJson: conversation,
        });

        console.log(
          `[ai] agent=claim prompt=${totalPromptTokens} cached=${totalCachedTokens} output=${totalOutputTokens} total=${totalPromptTokens + totalOutputTokens} hit_rate=${
            totalPromptTokens > 0
              ? ((totalCachedTokens / totalPromptTokens) * 100).toFixed(1)
              : "0.0"
          }%`,
        );

        send({ type: "done" });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
