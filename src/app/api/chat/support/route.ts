import { auth } from "@clerk/nextjs/server";
import type { Content } from "@google/genai";
import { getGoogleAI, SUPPORT_AGENT_MODEL } from "@/lib/ai/client";
import { SUPPORT_AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts/support-agent";
import { db } from "@/lib/db/client";
import { chatSessions } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { messages?: IncomingMessage[] };
  try {
    payload = (await req.json()) as { messages?: IncomingMessage[] };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const incoming = payload.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return new Response("messages array required", { status: 400 });
  }

  const conversation: Content[] = incoming.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const ai = getGoogleAI();

        const apiStream = await ai.models.generateContentStream({
          model: SUPPORT_AGENT_MODEL,
          contents: conversation,
          config: {
            systemInstruction: SUPPORT_AGENT_SYSTEM_PROMPT,
            maxOutputTokens: 512,
          },
        });

        let bufferedText = "";
        for await (const chunk of apiStream) {
          if (chunk.text) {
            bufferedText += chunk.text;
            send({ type: "text-delta", text: chunk.text });
          }
        }

        if (bufferedText.length > 0) {
          conversation.push({
            role: "model",
            parts: [{ text: bufferedText }],
          });
        }

        await db.insert(chatSessions).values({
          userClerkId: userId,
          agentType: "support",
          messagesJson: conversation,
        });

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
