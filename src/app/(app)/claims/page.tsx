import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db/client";
import { claims, flights, policies } from "@/lib/db/schema";
import {
  CANCELLED_TIER_INDEX,
  TIER_MULTIPLIERS,
  tierLabel,
} from "@/lib/ai/tiers";

const formatDollars = (cents: number) => (cents / 100).toFixed(2);

type ClaimRow = {
  claimId: string;
  policyId: string;
  payoutCents: number;
  status: string;
  tierIndex: number | null;
  decidedAt: Date | null;
  iata: string;
  origin: string;
  destination: string;
  flightStatus: string | null;
  scheduledDepAt: Date;
  actualDepAt: Date | null;
};

export default async function ClaimsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rows: ClaimRow[] = (
    await db
      .select({
        claimId: claims.id,
        policyId: claims.policyId,
        payoutCents: claims.payoutCents,
        status: claims.status,
        tierIndex: claims.triggeredTierIndex,
        decidedAt: claims.decidedAt,
        iata: flights.iata,
        flightNumber: flights.flightNumber,
        origin: flights.origin,
        destination: flights.destination,
        flightStatus: flights.status,
        scheduledDepAt: flights.scheduledDepAt,
        actualDepAt: flights.actualDepAt,
      })
      .from(claims)
      .innerJoin(policies, eq(claims.policyId, policies.id))
      .innerJoin(flights, eq(policies.flightId, flights.id))
      .where(eq(claims.userClerkId, userId))
      .orderBy(desc(claims.decidedAt))
  ).map((r) => ({
    claimId: r.claimId,
    policyId: r.policyId,
    payoutCents: r.payoutCents ?? 0,
    status: r.status,
    tierIndex: r.tierIndex,
    decidedAt: r.decidedAt,
    iata: r.iata ?? r.flightNumber,
    origin: r.origin,
    destination: r.destination,
    flightStatus: r.flightStatus,
    scheduledDepAt: r.scheduledDepAt,
    actualDepAt: r.actualDepAt,
  }));

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Claims</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every payout that's settled to your card.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <ClaimCard key={row.claimId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimCard({ row }: { row: ClaimRow }) {
  const tier = row.tierIndex !== null ? TIER_MULTIPLIERS[row.tierIndex] : null;
  const isCancelled = row.tierIndex === CANCELLED_TIER_INDEX;

  let delayLine: string;
  if (isCancelled) {
    delayLine = "Cancelled";
  } else if (row.actualDepAt) {
    const minutes = Math.max(
      0,
      Math.floor(
        (row.actualDepAt.getTime() - row.scheduledDepAt.getTime()) / 60_000,
      ),
    );
    delayLine = `Delayed ${minutes} min`;
  } else if (tier) {
    delayLine = tierLabel(tier);
  } else {
    delayLine = "Delay";
  }

  const tierSubline = tier
    ? `${tierLabel(tier)} tier · ${tier.multiplier}× payout`
    : null;

  const when = row.decidedAt
    ? row.decidedAt.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <Link
      href={`/policies/${row.policyId}`}
      className="block rounded-lg border bg-background p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="font-medium">
            {row.iata} · {row.origin} → {row.destination}
          </div>
          <div className="text-sm">{delayLine}</div>
          {tierSubline && (
            <div className="text-xs text-muted-foreground">{tierSubline}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">
            ${formatDollars(row.payoutCents)}
          </div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            <span className="capitalize">{row.status}</span>
          </div>
        </div>
      </div>
      {when && (
        <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          {when}
        </div>
      )}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
      <p className="text-sm font-medium">No claims yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Payouts appear here when one of your flights crosses a delay tier.
      </p>
    </div>
  );
}
