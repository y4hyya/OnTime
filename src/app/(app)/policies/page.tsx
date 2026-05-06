import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/client";
import { flights, policies } from "@/lib/db/schema";

const formatDollars = (cents: number) => (cents / 100).toFixed(2);

const STATUS_PRIORITY: Record<string, number> = {
  claimable: 0,
  active: 1,
  paid_out: 2,
  quoted: 3,
  expired: 4,
  cancelled: 5,
};

type Row = {
  policyId: string;
  status: string;
  premiumCents: number;
  iata: string;
  origin: string;
  destination: string;
  scheduledDepAt: Date;
  createdAt: Date;
};

export default async function PoliciesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rawRows = await db
    .select({
      policyId: policies.id,
      status: policies.status,
      premiumCents: policies.premiumCents,
      iata: flights.iata,
      flightNumber: flights.flightNumber,
      origin: flights.origin,
      destination: flights.destination,
      scheduledDepAt: flights.scheduledDepAt,
      createdAt: policies.createdAt,
    })
    .from(policies)
    .innerJoin(flights, eq(policies.flightId, flights.id))
    .where(eq(policies.userClerkId, userId))
    .orderBy(desc(policies.createdAt));

  const rows: Row[] = rawRows
    .map((r) => ({
      policyId: r.policyId,
      status: r.status,
      premiumCents: r.premiumCents,
      iata: r.iata ?? r.flightNumber,
      origin: r.origin,
      destination: r.destination,
      scheduledDepAt: r.scheduledDepAt,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coverage you've bought, sorted by what needs your attention.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/quote" />}>
          New quote
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PolicyCard key={row.policyId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyCard({ row }: { row: Row }) {
  const dep = row.scheduledDepAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
          <div className="text-xs text-muted-foreground">{dep}</div>
        </div>
        <div className="text-right">
          <StatusBadge status={row.status} />
          <div className="mt-1 text-xs text-muted-foreground">
            ${formatDollars(row.premiumCents)} premium
          </div>
        </div>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = badgeConfig(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${config}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function badgeConfig(status: string): string {
  switch (status) {
    case "claimable":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "active":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "paid_out":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
      <p className="text-sm font-medium">No policies yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Insure a flight from the quote page and it'll show up here.
      </p>
      <Button
        className="mt-4"
        nativeButton={false}
        render={<Link href="/quote" />}
      >
        Get a quote
      </Button>
    </div>
  );
}
