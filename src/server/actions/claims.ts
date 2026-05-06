"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { claims, events, policies } from "@/lib/db/schema";
import { TIER_MULTIPLIERS } from "@/lib/ai/tiers";

export type ClaimResult = {
  claimId: string;
  payoutCents: number;
  tierIndex: number;
  alreadyClaimed: boolean;
};

/**
 * One-click parametric payout for a claimable policy.
 *
 * Reads the highest tier the policy ever crossed from the `policy_triggered`
 * events log, multiplies the premium by that tier's multiplier, and writes a
 * `claims` row + flips the policy to `paid_out` in a single transaction.
 *
 * Idempotent: re-invocation on a `paid_out` policy returns the existing claim
 * instead of inserting a second one.
 */
export async function claimPolicy(policyId: string): Promise<ClaimResult> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const [policy] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.id, policyId), eq(policies.userClerkId, userId)))
    .limit(1);
  if (!policy) throw new Error("Policy not found");

  if (policy.status === "paid_out") {
    const [existing] = await db
      .select()
      .from(claims)
      .where(eq(claims.policyId, policyId))
      .limit(1);
    if (!existing) {
      throw new Error("Policy is paid_out but has no claim row");
    }
    return {
      claimId: existing.id,
      payoutCents: existing.payoutCents ?? 0,
      tierIndex: existing.triggeredTierIndex ?? -1,
      alreadyClaimed: true,
    };
  }

  if (policy.status !== "claimable") {
    throw new Error(
      `Policy is ${policy.status}; only claimable policies can be claimed`,
    );
  }

  const tierIndex = await maxTierIndexForPolicy(policyId);
  if (tierIndex < 0) {
    throw new Error("No trigger event found for claimable policy");
  }
  const tier = TIER_MULTIPLIERS[tierIndex];
  if (!tier) {
    throw new Error(`Unknown tier index ${tierIndex}`);
  }
  const payoutCents = policy.premiumCents * tier.multiplier;

  const claimId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(claims)
      .values({
        policyId,
        userClerkId: userId,
        status: "paid",
        payoutCents,
        triggeredTierIndex: tierIndex,
        decidedAt: new Date(),
      })
      .returning({ id: claims.id });

    await tx
      .update(policies)
      .set({ status: "paid_out" })
      .where(eq(policies.id, policyId));

    return inserted.id;
  });

  revalidatePath(`/policies/${policyId}`);
  revalidatePath("/policies");

  return {
    claimId,
    payoutCents,
    tierIndex,
    alreadyClaimed: false,
  };
}

async function maxTierIndexForPolicy(policyId: string): Promise<number> {
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
