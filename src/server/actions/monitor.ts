"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { flights, policies } from "@/lib/db/schema";
import { getFlight } from "@/lib/flights/cache";
import { evaluatePolicyTriggersForFlight } from "@/server/monitor";

export type RefreshResult = {
  source: "cache" | "api";
  status: string;
  triggered: number;
};

/**
 * Manual "Check now" trigger. The user-facing fallback for when Vercel cron
 * hasn't fired (local dev, free-tier latency, etc.).
 */
export async function refreshPolicyFlight(
  policyId: string,
): Promise<RefreshResult> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const [policy] = await db
    .select()
    .from(policies)
    .where(
      and(eq(policies.id, policyId), eq(policies.userClerkId, userId)),
    )
    .limit(1);
  if (!policy) throw new Error("Policy not found");

  const [flight] = await db
    .select()
    .from(flights)
    .where(eq(flights.id, policy.flightId))
    .limit(1);
  if (!flight) throw new Error("Flight not found");

  const iata = flight.iata ?? flight.flightNumber;
  const date = flight.scheduledDepAt.toISOString().slice(0, 10);
  const result = await getFlight(iata, date, { forceRefresh: true });
  if (!result) throw new Error("Flight no longer available from data source");

  const trig = await evaluatePolicyTriggersForFlight(policy.flightId);

  revalidatePath(`/policies/${policyId}`);

  return {
    source: result.source,
    status: result.data.status,
    triggered: trig.triggered,
  };
}
