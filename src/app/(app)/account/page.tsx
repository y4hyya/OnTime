import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Plane, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/client";
import { claims, policies } from "@/lib/db/schema";

const formatDollars = (cents: number) => (cents / 100).toFixed(2);

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();
  if (!user) redirect("/");

  const primaryEmail = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );

  const [policySummary] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${policies.status} = 'active')`.mapWith(Number),
      claimable: sql<number>`count(*) filter (where ${policies.status} = 'claimable')`.mapWith(Number),
      paidOut: sql<number>`count(*) filter (where ${policies.status} = 'paid_out')`.mapWith(Number),
      premiumsCents: sql<number>`coalesce(sum(${policies.premiumCents}) filter (where ${policies.status} != 'quoted'), 0)`.mapWith(Number),
    })
    .from(policies)
    .where(eq(policies.userClerkId, userId));

  const [payoutSummary] = await db
    .select({
      claimsCount: sql<number>`count(*)`.mapWith(Number),
      payoutsCents: sql<number>`coalesce(sum(${claims.payoutCents}), 0)`.mapWith(Number),
    })
    .from(claims)
    .where(eq(claims.userClerkId, userId));

  const totalPolicies = policySummary?.total ?? 0;
  const activeCount = policySummary?.active ?? 0;
  const claimableCount = policySummary?.claimable ?? 0;
  const paidOutCount = policySummary?.paidOut ?? 0;
  const premiumsCents = policySummary?.premiumsCents ?? 0;
  const claimsCount = payoutSummary?.claimsCount ?? 0;
  const payoutsCents = payoutSummary?.payoutsCents ?? 0;

  const netCents = payoutsCents - premiumsCents;

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {primaryEmail?.emailAddress ?? "No primary email"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Plane className="size-4 text-muted-foreground" />}
          label="Active coverage"
          value={`${activeCount + claimableCount}`}
          sub={
            claimableCount > 0
              ? `${claimableCount} claimable`
              : `${totalPolicies} total policies`
          }
        />
        <StatCard
          icon={<Wallet className="size-4 text-muted-foreground" />}
          label="Premiums paid"
          value={`$${formatDollars(premiumsCents)}`}
          sub={`across ${totalPolicies} ${totalPolicies === 1 ? "policy" : "policies"}`}
        />
        <StatCard
          icon={<Receipt className="size-4 text-muted-foreground" />}
          label="Payouts received"
          value={`$${formatDollars(payoutsCents)}`}
          sub={`from ${claimsCount} ${claimsCount === 1 ? "claim" : "claims"}`}
        />
      </div>

      {totalPolicies > 0 && (
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">
                Net (payouts − premiums)
              </div>
              <div
                className={`text-2xl font-semibold tracking-tight ${
                  netCents > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : netCents < 0
                      ? "text-foreground"
                      : "text-foreground"
                }`}
              >
                {netCents >= 0 ? "+" : "−"}${formatDollars(Math.abs(netCents))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/policies" />}
              >
                Policies
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/claims" />}
              >
                Claims
              </Button>
            </div>
          </div>
          {paidOutCount > 0 && (
            <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              {paidOutCount} {paidOutCount === 1 ? "policy has" : "policies have"}{" "}
              paid out so far.
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Account ID
        </div>
        <code className="mt-1 block break-all font-mono text-xs">{userId}</code>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
