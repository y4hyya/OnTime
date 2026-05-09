import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

type PersonaSpec = {
  key: "1" | "2" | "3";
  userEnvVar: "DEMO_USER_1" | "DEMO_USER_2" | "DEMO_USER_3";
  flight: {
    iata: string;
    flightNumber: string;
    origin: string;
    destination: string;
    scheduledDepAt: Date;
    scheduledArrAt: Date;
    actualDepAt: Date | null;
    actualArrAt: Date | null;
    status: string;
  };
  policyStatus: "active" | "claimable" | "paid_out";
  trigger?: {
    tierIndex: number;
    delayMinutes: number | null;
    triggeredAt: Date;
  };
  claim?: {
    payoutMultiplier: number;
    tierIndex: number;
    decidedAt: Date;
  };
  description: string;
};

function buildSpecs(): PersonaSpec[] {
  const now = new Date();

  // Persona A: brand-new policy on a flight 24h from now.
  const aDep = new Date(now.getTime() + 24 * HOUR_MS);
  const aArr = new Date(aDep.getTime() + 11 * HOUR_MS);

  // Persona B: flight scheduled 1h ago, actually departed 65 min late (60+ min tier just triggered).
  const bDep = new Date(now.getTime() - 1 * HOUR_MS);
  const bActualDep = new Date(bDep.getTime() + 65 * MIN_MS);
  const bArr = new Date(bDep.getTime() + 7 * HOUR_MS);

  // Persona C: flight from 2 days ago, cancelled. Claim filed yesterday.
  const cDep = new Date(now.getTime() - 2 * DAY_MS);
  const cArr = new Date(cDep.getTime() + 9 * HOUR_MS);
  const cTriggered = new Date(now.getTime() - 1 * DAY_MS - 2 * HOUR_MS);
  const cDecided = new Date(now.getTime() - 1 * DAY_MS);

  return [
    {
      key: "1",
      userEnvVar: "DEMO_USER_1",
      flight: {
        iata: "OT001",
        flightNumber: "OT001",
        origin: "LTFM",
        destination: "KJFK",
        scheduledDepAt: aDep,
        scheduledArrAt: aArr,
        actualDepAt: null,
        actualArrAt: null,
        status: "scheduled",
      },
      policyStatus: "active",
      description: "brand-new policy, flight tomorrow, nothing triggered yet",
    },
    {
      key: "2",
      userEnvVar: "DEMO_USER_2",
      flight: {
        iata: "OT117",
        flightNumber: "OT117",
        origin: "EGLL",
        destination: "KJFK",
        scheduledDepAt: bDep,
        scheduledArrAt: bArr,
        actualDepAt: bActualDep,
        actualArrAt: null,
        status: "delayed",
      },
      policyStatus: "claimable",
      trigger: {
        tierIndex: 1,
        delayMinutes: 65,
        triggeredAt: now,
      },
      description: "claimable policy, flight delayed 65 min (60+ tier triggered)",
    },
    {
      key: "3",
      userEnvVar: "DEMO_USER_3",
      flight: {
        iata: "OT400",
        flightNumber: "OT400",
        origin: "EDDF",
        destination: "KJFK",
        scheduledDepAt: cDep,
        scheduledArrAt: cArr,
        actualDepAt: null,
        actualArrAt: null,
        status: "cancelled",
      },
      policyStatus: "paid_out",
      trigger: {
        tierIndex: 3,
        delayMinutes: null,
        triggeredAt: cTriggered,
      },
      claim: {
        payoutMultiplier: 20,
        tierIndex: 3,
        decidedAt: cDecided,
      },
      description: "paid-out policy, flight cancelled 2 days ago, claim paid yesterday",
    },
  ];
}

async function main() {
  const specs = buildSpecs();

  const missing = specs
    .map((s) => s.userEnvVar)
    .filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `Missing env vars: ${missing.join(", ")}. Add them to .env.local with Clerk user IDs.`,
    );
    console.error(
      "Sign up 3 test users in the Clerk dashboard, copy each user_xxx ID, and paste them in.",
    );
    process.exit(1);
  }

  const { db } = await import("../src/lib/db/client");
  const { and, eq, sql } = await import("drizzle-orm");
  const { claims, events, flights, policies } = await import(
    "../src/lib/db/schema"
  );
  const { priceFlight } = await import("../src/lib/ai/pricing");

  console.log("Seeding demo personas...\n");

  for (const spec of specs) {
    const userClerkId = process.env[spec.userEnvVar]!;
    console.log(`Persona ${spec.key} (${userClerkId.slice(0, 16)}...): ${spec.description}`);

    const flightId = await upsertFlight(spec.flight);

    const premium = priceFlight({ scheduledDepAt: spec.flight.scheduledDepAt });
    const policyId = await upsertPolicy({
      userClerkId,
      flightId,
      premiumCents: premium.premiumCents,
      status: spec.policyStatus,
    });

    // Wipe trigger events for a clean reseed.
    await db
      .delete(events)
      .where(
        and(
          eq(events.type, "policy_triggered"),
          sql`${events.payloadJson}->>'policyId' = ${policyId}`,
        ),
      );

    if (spec.trigger) {
      await db.insert(events).values({
        type: "policy_triggered",
        payloadJson: {
          policyId,
          flightId,
          tierIndex: spec.trigger.tierIndex,
          delayMinutes: spec.trigger.delayMinutes,
          triggeredAt: spec.trigger.triggeredAt.toISOString(),
        },
      });
    }

    // Wipe and reset the claim row for clean reseed.
    await db.delete(claims).where(eq(claims.policyId, policyId));
    if (spec.claim) {
      await db.insert(claims).values({
        policyId,
        userClerkId,
        status: "paid",
        payoutCents: premium.premiumCents * spec.claim.payoutMultiplier,
        triggeredTierIndex: spec.claim.tierIndex,
        decidedAt: spec.claim.decidedAt,
      });
    }

    const dollars = (premium.premiumCents / 100).toFixed(2);
    console.log(
      `  → flight=${spec.flight.iata} policy=${policyId.slice(0, 8)} premium=$${dollars} status=${spec.policyStatus}`,
    );
  }

  console.log("\nDone. Sign in as each persona to see their state at /policies.");
  process.exit(0);

  async function upsertFlight(input: PersonaSpec["flight"]): Promise<string> {
    const startOfDay = new Date(input.scheduledDepAt);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(input.scheduledDepAt);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existing = await db
      .select()
      .from(flights)
      .where(
        and(
          eq(flights.iata, input.iata),
          sql`${flights.scheduledDepAt} BETWEEN ${startOfDay.toISOString()} AND ${endOfDay.toISOString()}`,
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const id = existing[0].id;
      await db
        .update(flights)
        .set({
          flightNumber: input.flightNumber,
          origin: input.origin,
          destination: input.destination,
          scheduledDepAt: input.scheduledDepAt,
          scheduledArrAt: input.scheduledArrAt,
          actualDepAt: input.actualDepAt,
          actualArrAt: input.actualArrAt,
          status: input.status,
          lastCheckedAt: new Date(),
        })
        .where(eq(flights.id, id));
      return id;
    }

    const inserted = await db
      .insert(flights)
      .values({
        iata: input.iata,
        flightNumber: input.flightNumber,
        origin: input.origin,
        destination: input.destination,
        scheduledDepAt: input.scheduledDepAt,
        scheduledArrAt: input.scheduledArrAt,
        actualDepAt: input.actualDepAt,
        actualArrAt: input.actualArrAt,
        status: input.status,
        lastCheckedAt: new Date(),
      })
      .returning({ id: flights.id });
    return inserted[0].id;
  }

  async function upsertPolicy(input: {
    userClerkId: string;
    flightId: string;
    premiumCents: number;
    status: "active" | "claimable" | "paid_out";
  }): Promise<string> {
    const existing = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.userClerkId, input.userClerkId),
          eq(policies.flightId, input.flightId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const id = existing[0].id;
      await db
        .update(policies)
        .set({
          premiumCents: input.premiumCents,
          status: input.status,
          coverageType: "parametric_delay",
        })
        .where(eq(policies.id, id));
      return id;
    }

    const inserted = await db
      .insert(policies)
      .values({
        userClerkId: input.userClerkId,
        flightId: input.flightId,
        premiumCents: input.premiumCents,
        coverageType: "parametric_delay",
        status: input.status,
      })
      .returning({ id: policies.id });
    return inserted[0].id;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
