import { and, eq, sql } from "drizzle-orm";
import type { FunctionDeclaration } from "@google/genai";
import { db } from "@/lib/db/client";
import { claims, events, flights, policies } from "@/lib/db/schema";
import { TIER_MULTIPLIERS, tierLabel } from "@/lib/ai/tiers";

export const getPolicyTool: FunctionDeclaration = {
  name: "get_policy",
  description:
    "Get the user's current policy details — flight, premium, status, peak triggered tier (if any), and claim record (if paid out). Call this before answering any question about the user's policy or payout. Returns deterministic dollar amounts for every relevant tier.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
  },
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

type GetPolicyResult =
  | { found: false }
  | {
      found: true;
      policy: {
        id: string;
        status: string;
        premiumCents: number;
        premiumDollars: string;
        flight: {
          iata: string;
          origin: string;
          destination: string;
          scheduledDepAt: string;
          scheduledArrAt: string;
          actualDepAt: string | null;
          status: string | null;
        };
        peakTrigger: {
          tierIndex: number;
          tierLabel: string;
          multiplier: number;
          delayMinutes: number | null;
          payoutDollars: string;
          triggeredAt: string;
        } | null;
        claim: {
          payoutDollars: string;
          tierIndex: number;
          tierLabel: string;
          multiplier: number;
          decidedAt: string | null;
        } | null;
      };
    };

export function createGetPolicyHandler(
  userClerkId: string,
  policyId: string,
): (input: unknown) => Promise<GetPolicyResult> {
  return async (): Promise<GetPolicyResult> => {
    const [policy] = await db
      .select()
      .from(policies)
      .where(
        and(eq(policies.id, policyId), eq(policies.userClerkId, userClerkId)),
      )
      .limit(1);
    if (!policy) return { found: false };

    const [flight] = await db
      .select()
      .from(flights)
      .where(eq(flights.id, policy.flightId))
      .limit(1);
    if (!flight) return { found: false };

    const peakTrigger = await peakTriggerForPolicy(policy.id);

    const [claim] = await db
      .select()
      .from(claims)
      .where(eq(claims.policyId, policy.id))
      .limit(1);

    return {
      found: true,
      policy: {
        id: policy.id,
        status: policy.status,
        premiumCents: policy.premiumCents,
        premiumDollars: dollars(policy.premiumCents),
        flight: {
          iata: flight.iata ?? flight.flightNumber,
          origin: flight.origin,
          destination: flight.destination,
          scheduledDepAt: flight.scheduledDepAt.toISOString(),
          scheduledArrAt: flight.scheduledArrAt.toISOString(),
          actualDepAt: flight.actualDepAt?.toISOString() ?? null,
          status: flight.status,
        },
        peakTrigger: peakTrigger
          ? {
              tierIndex: peakTrigger.tierIndex,
              tierLabel: tierLabel(TIER_MULTIPLIERS[peakTrigger.tierIndex]),
              multiplier: TIER_MULTIPLIERS[peakTrigger.tierIndex].multiplier,
              delayMinutes: peakTrigger.delayMinutes,
              payoutDollars: dollars(
                policy.premiumCents *
                  TIER_MULTIPLIERS[peakTrigger.tierIndex].multiplier,
              ),
              triggeredAt: peakTrigger.triggeredAt,
            }
          : null,
        claim: claim
          ? {
              payoutDollars: dollars(claim.payoutCents ?? 0),
              tierIndex: claim.triggeredTierIndex ?? -1,
              tierLabel:
                claim.triggeredTierIndex !== null &&
                TIER_MULTIPLIERS[claim.triggeredTierIndex]
                  ? tierLabel(TIER_MULTIPLIERS[claim.triggeredTierIndex])
                  : "Unknown",
              multiplier:
                claim.triggeredTierIndex !== null &&
                TIER_MULTIPLIERS[claim.triggeredTierIndex]
                  ? TIER_MULTIPLIERS[claim.triggeredTierIndex].multiplier
                  : 0,
              decidedAt: claim.decidedAt?.toISOString() ?? null,
            }
          : null,
      },
    };
  };
}

async function peakTriggerForPolicy(policyId: string): Promise<{
  tierIndex: number;
  delayMinutes: number | null;
  triggeredAt: string;
} | null> {
  const rows = await db
    .select({ payload: events.payloadJson })
    .from(events)
    .where(
      and(
        eq(events.type, "policy_triggered"),
        sql`${events.payloadJson}->>'policyId' = ${policyId}`,
      ),
    );

  let bestTier = -1;
  let bestDelay: number | null = null;
  let bestAt = "";
  for (const row of rows) {
    const p = row.payload as
      | {
          tierIndex?: unknown;
          delayMinutes?: unknown;
          triggeredAt?: unknown;
        }
      | null;
    const idx = p?.tierIndex;
    if (typeof idx === "number" && idx > bestTier) {
      bestTier = idx;
      bestDelay = typeof p?.delayMinutes === "number" ? p.delayMinutes : null;
      bestAt = typeof p?.triggeredAt === "string" ? p.triggeredAt : "";
    }
  }

  return bestTier >= 0
    ? { tierIndex: bestTier, delayMinutes: bestDelay, triggeredAt: bestAt }
    : null;
}
