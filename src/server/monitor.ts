import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flights, policies } from "@/lib/db/schema";
import { getFlight } from "@/lib/flights/cache";

const T_MINUS_24H_MS = 24 * 60 * 60 * 1000;
const T_PLUS_6H_MS = 6 * 60 * 60 * 1000;

export type MonitorResult = {
  totalCandidates: number;
  checked: number;
  errors: number;
};

/**
 * Force-refresh the flight data for every active policy whose scheduled
 * departure falls within the monitoring window (T-24h through T+6h).
 *
 * Does NOT mark policies claimable — that logic lives in subtask 3.2.
 * This is purely a "keep `flights` rows fresh" pass.
 */
export async function monitorActivePolicies(): Promise<MonitorResult> {
  const now = new Date();
  const earliest = new Date(now.getTime() - T_PLUS_6H_MS);
  const latest = new Date(now.getTime() + T_MINUS_24H_MS);

  const candidates = await db
    .select({
      flightId: flights.id,
      iata: flights.iata,
      flightNumber: flights.flightNumber,
      scheduledDepAt: flights.scheduledDepAt,
    })
    .from(policies)
    .innerJoin(flights, eq(policies.flightId, flights.id))
    .where(
      and(
        eq(policies.status, "active"),
        gte(flights.scheduledDepAt, earliest),
        lte(flights.scheduledDepAt, latest),
      ),
    );

  const seenFlightIds = new Set<string>();
  let checked = 0;
  let errors = 0;

  for (const row of candidates) {
    if (seenFlightIds.has(row.flightId)) continue;
    seenFlightIds.add(row.flightId);

    const iata = row.iata ?? row.flightNumber;
    const date = row.scheduledDepAt.toISOString().slice(0, 10);

    try {
      const result = await getFlight(iata, date, { forceRefresh: true });
      if (result) checked++;
    } catch (e) {
      errors++;
      console.error(
        `Monitor: refresh failed for flight ${row.flightId} (${iata} on ${date}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return {
    totalCandidates: candidates.length,
    checked,
    errors,
  };
}
