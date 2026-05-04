import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { CheckNowButton } from "@/components/policy/CheckNowButton";
import { db } from "@/lib/db/client";
import { flights, policies } from "@/lib/db/schema";
import { TIER_MULTIPLIERS, tierLabel } from "@/lib/ai/tiers";

type Params = { id: string };

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

  const dollars = (cents: number) => (cents / 100).toFixed(2);

  return (
    <div className="mx-auto max-w-md space-y-6 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Policy</h1>

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
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Premium</div>
            <div className="text-lg font-semibold">
              ${dollars(policy.premiumCents)}
            </div>
          </div>
        </div>

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
                  ${dollars(policy.premiumCents * tier.multiplier)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CheckNowButton policyId={policy.id} />

      <Button nativeButton={false} render={<Link href="/policies" />}>
        All policies
      </Button>
    </div>
  );
}
