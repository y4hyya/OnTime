import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckNowButton } from "@/components/policy/CheckNowButton";
import { ClaimButton } from "@/components/policy/ClaimButton";
import { PolicyChat } from "@/components/policy/PolicyChat";
import { db } from "@/lib/db/client";
import { claims, events, flights, policies } from "@/lib/db/schema";
import { TIER_MULTIPLIERS, tierLabel } from "@/lib/ai/tiers";

type Params = { id: string };

const formatDollars = (cents: number) => (cents / 100).toFixed(2);

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const { id } = await params;

  const [policy] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.id, id), eq(policies.userClerkId, userId)))
    .limit(1);

  if (!policy) notFound();

  const [flight] = await db
    .select()
    .from(flights)
    .where(eq(flights.id, policy.flightId))
    .limit(1);

  if (!flight) notFound();

  const peakTrigger =
    policy.status === "claimable" ? await peakTriggerForPolicy(id) : null;

  const claim =
    policy.status === "paid_out"
      ? (
          await db
            .select()
            .from(claims)
            .where(eq(claims.policyId, id))
            .limit(1)
        )[0]
      : null;

  return (
    <div className="mx-auto max-w-md space-y-6 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Policy</h1>

      {policy.status === "paid_out" && claim && (
        <PaidOutCard
          payoutCents={claim.payoutCents ?? 0}
          tierIndex={claim.triggeredTierIndex ?? -1}
          decidedAt={claim.decidedAt}
        />
      )}

      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <div className="text-xs text-muted-foreground">Flight</div>
          <div className="font-medium">
            {flight.iata ?? flight.flightNumber} · {flight.origin} →{" "}
            {flight.destination}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {flight.scheduledDepAt.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>

        <div className="flex justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="font-medium capitalize">
              {policy.status.replace("_", " ")}
            </div>
            {peakTrigger && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {peakTrigger.delayMinutes !== null
                  ? `Delayed ${peakTrigger.delayMinutes} min`
                  : "Cancelled"}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Premium</div>
            <div className="text-lg font-semibold">
              ${formatDollars(policy.premiumCents)}
            </div>
          </div>
        </div>

        {policy.status !== "paid_out" && (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">
              Payouts if delayed
            </div>
            <div className="space-y-1.5 text-sm">
              {TIER_MULTIPLIERS.map((tier, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {tierLabel(tier)}
                  </span>
                  <span className="font-medium">
                    ${formatDollars(policy.premiumCents * tier.multiplier)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {policy.status === "claimable" && peakTrigger && (
        <ClaimButton
          policyId={policy.id}
          payoutCents={
            policy.premiumCents *
            TIER_MULTIPLIERS[peakTrigger.tierIndex].multiplier
          }
        />
      )}

      {(policy.status === "active" || policy.status === "claimable") && (
        <CheckNowButton policyId={policy.id} />
      )}

      {(policy.status === "claimable" || policy.status === "paid_out") && (
        <PolicyChat policyId={policy.id} status={policy.status} />
      )}

      <Button nativeButton={false} render={<Link href="/policies" />}>
        All policies
      </Button>
    </div>
  );
}

function PaidOutCard({
  payoutCents,
  tierIndex,
  decidedAt,
}: {
  payoutCents: number;
  tierIndex: number;
  decidedAt: Date | null;
}) {
  const tier = TIER_MULTIPLIERS[tierIndex];
  const triggerLine = tier
    ? `${tierLabel(tier)} tier · ${tier.multiplier}× payout`
    : "Payout settled";
  const when = decidedAt
    ? decidedAt.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-emerald-600/30 bg-emerald-50 p-5 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-5" />
        <span className="text-sm font-medium">Payout sent</span>
      </div>
      <div>
        <div className="text-3xl font-semibold tracking-tight">
          ${formatDollars(payoutCents)}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          to your card ending in 4242
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {triggerLine}
        {when ? ` · ${when}` : ""}
      </div>
    </div>
  );
}

async function peakTriggerForPolicy(
  policyId: string,
): Promise<{ tierIndex: number; delayMinutes: number | null } | null> {
  const rows = await db
    .select({ payload: events.payloadJson })
    .from(events)
    .where(
      and(
        eq(events.type, "policy_triggered"),
        sql`${events.payloadJson}->>'policyId' = ${policyId}`,
      ),
    )
    .orderBy(desc(events.createdAt));

  let bestTier = -1;
  let bestDelay: number | null = null;
  for (const row of rows) {
    const payload = row.payload as
      | { tierIndex?: unknown; delayMinutes?: unknown }
      | null;
    const idx = payload?.tierIndex;
    if (typeof idx === "number" && idx > bestTier) {
      bestTier = idx;
      bestDelay =
        typeof payload?.delayMinutes === "number" ? payload.delayMinutes : null;
    }
  }

  return bestTier >= 0
    ? { tierIndex: bestTier, delayMinutes: bestDelay }
    : null;
}
