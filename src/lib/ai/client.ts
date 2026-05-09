import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGoogleAI(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

export const QUOTE_AGENT_MODEL = "gemini-2.5-flash" as const;
export const SUPPORT_AGENT_MODEL = "gemini-2.5-flash-lite" as const;
