import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flights } from "@/lib/db/schema";
import { lookupFlightByNumber, normalizeIata } from "./client";
import type { FlightLookup, FlightStatus } from "./types";

const TTL_SCHEDULED_MS = 24 * 60 * 60 * 1000;
const TTL_ACTUALS_MS = 5 * 60 * 1000;
const IMMINENT_WINDOW_MS = 24 * 60 * 60 * 1000;

type FlightRow = typeof flights.$inferSelect;

function ttlFor(row: FlightRow): number {
  const imminentOrInFlight =
    row.actualDepAt !== null ||
    row.scheduledDepAt.getTime() - Date.now() < IMMINENT_WINDOW_MS;
  return imminentOrInFlight ? TTL_ACTUALS_MS : TTL_SCHEDULED_MS;
}

function isFresh(row: FlightRow): boolean {
  if (!row.lastCheckedAt) return false;
  return Date.now() - row.lastCheckedAt.getTime() < ttlFor(row);
}

function rowToLookup(row: FlightRow): FlightLookup {
  return {
    iata: row.iata ?? row.flightNumber,
    flightNumber: row.flightNumber,
    origin: row.origin,
    destination: row.destination,
    scheduledDepAt: row.scheduledDepAt,
    scheduledArrAt: row.scheduledArrAt,
    actualDepAt: row.actualDepAt,
    actualArrAt: row.actualArrAt,
    status: (row.status as FlightStatus | null) ?? "unknown",
  };
}

async function findRow(
  iata: string,
  date: string,
): Promise<FlightRow | null> {
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);
  const rows = await db
    .select()
    .from(flights)
    .where(
      and(
        eq(flights.iata, iata),
        gte(flights.scheduledDepAt, startOfDay),
        lte(flights.scheduledDepAt, endOfDay),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(
  existing: FlightRow | null,
  lookup: FlightLookup,
): Promise<string> {
  const now = new Date();
  if (existing) {
    await db
      .update(flights)
      .set({
        origin: lookup.origin,
        destination: lookup.destination,
        scheduledDepAt: lookup.scheduledDepAt,
        scheduledArrAt: lookup.scheduledArrAt,
        actualDepAt: lookup.actualDepAt,
        actualArrAt: lookup.actualArrAt,
        status: lookup.status,
        lastCheckedAt: now,
      })
      .where(eq(flights.id, existing.id));
    return existing.id;
  }
  const inserted = await db
    .insert(flights)
    .values({
      iata: lookup.iata,
      flightNumber: lookup.flightNumber,
      origin: lookup.origin,
      destination: lookup.destination,
      scheduledDepAt: lookup.scheduledDepAt,
      scheduledArrAt: lookup.scheduledArrAt,
      actualDepAt: lookup.actualDepAt,
      actualArrAt: lookup.actualArrAt,
      status: lookup.status,
      lastCheckedAt: now,
    })
    .returning({ id: flights.id });
  return inserted[0].id;
}

export type FlightCacheResult = {
  id: string;
  data: FlightLookup;
  source: "cache" | "api";
};

export type GetFlightOptions = {
  /** Bypass the TTL check and always re-fetch from the API. Used by the monitor cron. */
  forceRefresh?: boolean;
};

/**
 * Read-through cache. Returns a fresh row from the DB if available, otherwise
 * fetches from AeroDataBox, persists, and returns the new data.
 */
export async function getFlight(
  iata: string,
  date: string,
  options: GetFlightOptions = {},
): Promise<FlightCacheResult | null> {
  const normalized = normalizeIata(iata);
  const existing = await findRow(normalized, date);
  if (existing && isFresh(existing) && !options.forceRefresh) {
    return { id: existing.id, data: rowToLookup(existing), source: "cache" };
  }
  const fresh = await lookupFlightByNumber(normalized, date);
  if (!fresh) return null;
  const id = await upsert(existing, fresh);
  return { id, data: fresh, source: "api" };
}
