import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { events, flights, policies } from "@/lib/db/schema";
import { computeTriggeredTier } from "@/lib/ai/tiers";
import { getFlight } from "@/lib/flights/cache";

const T_MINUS_24H_MS = 24 * 60 * 60 * 1000;
const T_PLUS_6H_MS = 6 * 60 * 60 * 1000;

export type MonitorResult = {
  totalCandidates: number;
  checked: number;
  triggered: number;
  errors: number;
};

/**
 * Force-refresh flight data for every active policy whose scheduled
 * departure falls within the monitoring window (T-24h through T+6h),
 * then evaluate trigger status for the affected policies.
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
        inArray(policies.status, ["active", "claimable"]),
        gte(flights.scheduledDepAt, earliest),
        lte(flights.scheduledDepAt, latest),
      ),
    );

  const seenFlightIds = new Set<string>();
  let checked = 0;
  let triggered = 0;
  let errors = 0;

  for (const row of candidates) {
    if (seenFlightIds.has(row.flightId)) continue;
    seenFlightIds.add(row.flightId);

    const iata = row.iata ?? row.flightNumber;
    const date = row.scheduledDepAt.toISOString().slice(0, 10);

    try {
      const result = await getFlight(iata, date, { forceRefresh: true });
      if (!result) continue;
      checked++;
      const trig = await evaluatePolicyTriggersForFlight(row.flightId);
      triggered += trig.triggered;
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
    triggered,
    errors,
  };
}

export type TriggerEvaluationResult = {
  flightId: string;
  policiesEvaluated: number;
  triggered: number;
};

type TriggerEventPayload = {
  policyId: string;
  flightId: string;
  tierIndex: number;
  delayMinutes: number | null;
  triggeredAt: string;
};

/**
 * For a given flight, determine which of its `active` or `claimable` policies
 * have crossed a new tier and emit `policy_triggered` events for them.
 *
 * Idempotent: a policy whose highest prior tier event already matches or
 * exceeds the current tier index is left untouched. The first trigger (only)
 * also flips `policies.status` from `active` to `claimable`; subsequent
 * tier-upgrade events keep the status stable so 3.3's notification path
 * fires exactly once per policy.
 */
export async function evaluatePolicyTriggersForFlight(
  flightId: string,
): Promise<TriggerEvaluationResult> {
  const [flight] = await db
    .select()
    .from(flights)
    .where(eq(flights.id, flightId))
    .limit(1);
  if (!flight) {
    return { flightId, policiesEvaluated: 0, triggered: 0 };
  }

  const tier = computeTriggeredTier({
    status: flight.status,
    scheduledDepAt: flight.scheduledDepAt,
    actualDepAt: flight.actualDepAt,
  });
  if (!tier) {
    return { flightId, policiesEvaluated: 0, triggered: 0 };
  }

  const affected = await db
    .select({ id: policies.id, status: policies.status })
    .from(policies)
    .where(
      and(
        eq(policies.flightId, flightId),
        inArray(policies.status, ["active", "claimable"]),
      ),
    );

  if (affected.length === 0) {
    return { flightId, policiesEvaluated: 0, triggered: 0 };
  }

  let triggered = 0;
  for (const policy of affected) {
    const priorMaxTier = await maxPriorTierIndex(policy.id);
    if (tier.tierIndex <= priorMaxTier) continue;

    const payload: TriggerEventPayload = {
      policyId: policy.id,
      flightId,
      tierIndex: tier.tierIndex,
      delayMinutes: tier.delayMinutes,
      triggeredAt: new Date().toISOString(),
    };
    await db.insert(events).values({
      type: "policy_triggered",
      payloadJson: payload,
    });

    if (policy.status === "active") {
      await db
        .update(policies)
        .set({ status: "claimable" })
        .where(eq(policies.id, policy.id));
    }

    triggered++;
  }

  return {
    flightId,
    policiesEvaluated: affected.length,
    triggered,
  };
}

async function maxPriorTierIndex(policyId: string): Promise<number> {
  const rows = await db
    .select({ payload: events.payloadJson })
    .from(events)
    .where(
      and(
        eq(events.type, "policy_triggered"),
        sql`${events.payloadJson}->>'policyId' = ${policyId}`,
      ),
    );
  let max = -1;
  for (const row of rows) {
    const idx = (row.payload as { tierIndex?: unknown } | null)?.tierIndex;
    if (typeof idx === "number" && idx > max) max = idx;
  }
  return max;
}
