import type { FlightLookup, FlightStatus } from "./types";

const BASE_URL = "https://aerodatabox.p.rapidapi.com";
const API_HOST = "aerodatabox.p.rapidapi.com";

type AeroDataBoxAirport = {
  iata?: string;
  icao?: string;
};

type AeroDataBoxTime = {
  utc?: string;
  local?: string;
};

type AeroDataBoxLeg = {
  airport?: AeroDataBoxAirport;
  scheduledTime?: AeroDataBoxTime;
  actualTime?: AeroDataBoxTime;
  predictedTime?: AeroDataBoxTime;
};

type AeroDataBoxFlight = {
  number?: string;
  status?: string;
  departure?: AeroDataBoxLeg;
  arrival?: AeroDataBoxLeg;
};

export function normalizeIata(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "");
}

function normalizeStatus(raw?: string): FlightStatus {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("delay")) return "delayed";
  if (s === "departed") return "departed";
  if (s === "enroute" || s === "en_route") return "en_route";
  if (s === "approaching") return "approaching";
  if (s === "arrived") return "arrived";
  if (s === "expected" || s === "scheduled") return "scheduled";
  return "unknown";
}

function parseUtc(raw?: string): Date | null {
  if (!raw) return null;
  // AeroDataBox returns "YYYY-MM-DD HH:mm" (UTC, no zone marker).
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class FlightLookupError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FlightLookupError";
  }
}

/**
 * Look up a flight by IATA flight number and scheduled departure date.
 * `date` must be `YYYY-MM-DD` (UTC).
 * Returns `null` if AeroDataBox has no matching flight.
 */
export async function lookupFlightByNumber(
  iata: string,
  date: string,
): Promise<FlightLookup | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new FlightLookupError("RAPIDAPI_KEY is not set");
  }

  const normalized = normalizeIata(iata);
  const url = `${BASE_URL}/flights/number/${encodeURIComponent(normalized)}/${date}`;
  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": API_HOST,
    },
  });

  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new FlightLookupError(
      `AeroDataBox lookup failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  const data = (await res.json()) as AeroDataBoxFlight[];
  if (!Array.isArray(data) || data.length === 0) return null;
  const f = data[0];

  const scheduledDepAt = parseUtc(f.departure?.scheduledTime?.utc);
  const scheduledArrAt = parseUtc(f.arrival?.scheduledTime?.utc);
  if (!scheduledDepAt || !scheduledArrAt) return null;

  const origin =
    f.departure?.airport?.icao ?? f.departure?.airport?.iata ?? "";
  const destination =
    f.arrival?.airport?.icao ?? f.arrival?.airport?.iata ?? "";

  return {
    iata: normalized,
    flightNumber: f.number?.replace(/\s+/g, "") ?? normalized,
    origin,
    destination,
    scheduledDepAt,
    scheduledArrAt,
    actualDepAt: parseUtc(f.departure?.actualTime?.utc),
    actualArrAt: parseUtc(f.arrival?.actualTime?.utc),
    status: normalizeStatus(f.status),
  };
}
