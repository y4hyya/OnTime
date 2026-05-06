import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const policyId = process.argv[2];
  const delayArg = process.argv[3];

  if (!policyId || !delayArg) {
    console.error(
      "Usage: pnpm tsx scripts/test-trigger.ts <policyId> <delayMinutes|cancelled>",
    );
    console.error(
      "Examples:",
      "\n  pnpm tsx scripts/test-trigger.ts <uuid> 35",
      "\n  pnpm tsx scripts/test-trigger.ts <uuid> 90",
      "\n  pnpm tsx scripts/test-trigger.ts <uuid> cancelled",
    );
    process.exit(1);
  }

  const { db } = await import("../src/lib/db/client");
  const { eq, and, sql } = await import("drizzle-orm");
  const { events, flights, policies } = await import("../src/lib/db/schema");
  const { evaluatePolicyTriggersForFlight } = await import(
    "../src/server/monitor"
  );

  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.id, policyId))
    .limit(1);
  if (!policy) {
    console.error(`Policy ${policyId} not found.`);
    process.exit(1);
  }

  const [flight] = await db
    .select()
    .from(flights)
    .where(eq(flights.id, policy.flightId))
    .limit(1);
  if (!flight) {
    console.error(`Flight ${policy.flightId} not found for policy.`);
    process.exit(1);
  }

  if (delayArg === "cancelled") {
    await db
      .update(flights)
      .set({ status: "cancelled", lastCheckedAt: new Date() })
      .where(eq(flights.id, flight.id));
    console.log(`Flight ${flight.id} marked cancelled.`);
  } else {
    const delayMinutes = Number(delayArg);
    if (!Number.isFinite(delayMinutes) || delayMinutes < 0) {
      console.error(`Invalid delay: ${delayArg}`);
      process.exit(1);
    }
    const actualDepAt = new Date(
      flight.scheduledDepAt.getTime() + delayMinutes * 60_000,
    );
    await db
      .update(flights)
      .set({
        actualDepAt,
        status: "departed",
        lastCheckedAt: new Date(),
      })
      .where(eq(flights.id, flight.id));
    console.log(
      `Flight ${flight.id} actual_dep_at set to ${actualDepAt.toISOString()} (+${delayMinutes}m).`,
    );
  }

  console.log(`Policy status before: ${policy.status}`);
  const result = await evaluatePolicyTriggersForFlight(policy.flightId);
  console.log("Trigger result:", result);

  const [refreshed] = await db
    .select({ status: policies.status })
    .from(policies)
    .where(eq(policies.id, policyId))
    .limit(1);
  console.log(`Policy status after:  ${refreshed?.status}`);

  const triggerEvents = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.type, "policy_triggered"),
        sql`${events.payloadJson}->>'policyId' = ${policyId}`,
      ),
    );
  console.log(`Trigger events for this policy: ${triggerEvents.length}`);
  for (const e of triggerEvents) {
    console.log("  ", JSON.stringify(e.payloadJson));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
