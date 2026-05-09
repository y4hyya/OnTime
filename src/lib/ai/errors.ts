/**
 * Map an SDK or upstream error into a user-facing string for the chat UI.
 * Gemini SDK errors arrive with the raw API JSON in `.message`, which renders
 * as garbage in red banners. This helper parses what it can and falls back to
 * a clean generic message.
 */
export function friendlyAgentError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);

  const apiCode = parseGoogleApiError(raw);
  if (apiCode) {
    const { code, status, message } = apiCode;

    if (code === 503 || status === "UNAVAILABLE") {
      return "The AI service is busy right now. Try again in a few seconds.";
    }
    if (code === 429 || status === "RESOURCE_EXHAUSTED") {
      return "Hit a rate limit. Wait a moment and try again.";
    }
    if (code === 401 || code === 403) {
      return "AI service authentication failed. Contact support if this persists.";
    }
    if (code >= 500) {
      return "The AI service had a hiccup. Please try again.";
    }
    if (message && message.length < 200) {
      return message;
    }
  }

  if (raw.includes("GEMINI_API_KEY is not set")) {
    return "AI service is not configured (missing API key).";
  }
  if (raw.includes("ANTHROPIC_API_KEY is not set")) {
    return "AI service is not configured (missing API key).";
  }
  if (raw.toLowerCase().includes("timeout")) {
    return "Request timed out. Please try again.";
  }
  if (raw.toLowerCase().includes("network")) {
    return "Network error. Check your connection and try again.";
  }

  return "Something went wrong. Please try again.";
}

type GoogleApiError = {
  code: number;
  status?: string;
  message?: string;
};

function parseGoogleApiError(raw: string): GoogleApiError | null {
  // Gemini SDK errors look like: `{"error":{"message":"...stringified JSON...","code":503,"status":"..."}}`
  // The inner message is sometimes itself a JSON-encoded API error envelope.
  try {
    const outer = JSON.parse(raw);
    const err = outer.error ?? outer;
    if (typeof err === "object" && err !== null) {
      const code = typeof err.code === "number" ? err.code : NaN;
      const status = typeof err.status === "string" ? err.status : undefined;
      let message: string | undefined;
      if (typeof err.message === "string") {
        try {
          const inner = JSON.parse(err.message);
          message =
            inner?.error?.message ?? inner?.message ?? err.message;
        } catch {
          message = err.message;
        }
      }
      if (!Number.isNaN(code)) {
        return { code, status, message };
      }
    }
  } catch {
    // not JSON — fall through
  }

  // Sometimes the error message has a leading status line, e.g. "[503 Service Unavailable]..."
  const codeMatch = raw.match(/\b(\d{3})\b/);
  if (codeMatch) {
    const code = Number(codeMatch[1]);
    if (code >= 400 && code < 600) {
      return { code };
    }
  }

  return null;
}
