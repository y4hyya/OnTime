import type { FunctionDeclaration } from "@google/genai";
import { getFlight } from "@/lib/flights/cache";

export const lookupFlightTool: FunctionDeclaration = {
  name: "lookup_flight",
  description:
    "Look up a real flight by IATA code and date. Returns scheduled departure/arrival, origin/destination ICAO codes, and current status. Returns { found: false } if the flight doesn't exist for that date in our data source.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      iata: {
        type: "string",
        description:
          "IATA flight code, e.g. 'LH400', 'BA117', 'TK1'. Case-insensitive; whitespace OK.",
      },
      date: {
        type: "string",
        description: "Scheduled departure date in YYYY-MM-DD (UTC).",
      },
    },
    required: ["iata", "date"],
  },
};

type LookupInput = { iata: string; date: string };

export async function lookupFlightHandler(input: unknown): Promise<unknown> {
  const { iata, date } = input as LookupInput;
  const result = await getFlight(iata, date);
  if (!result) return { found: false };
  return {
    found: true,
    source: result.source,
    flight: {
      iata: result.data.iata,
      origin: result.data.origin,
      destination: result.data.destination,
      scheduledDepAt: result.data.scheduledDepAt.toISOString(),
      scheduledArrAt: result.data.scheduledArrAt.toISOString(),
      actualDepAt: result.data.actualDepAt?.toISOString() ?? null,
      status: result.data.status,
    },
  };
}
