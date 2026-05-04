import { eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/client";
import { flights, policies } from "@/lib/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { ensurePolicyFromSession } from "@/server/checkout";

type SearchParams = { session_id?: string };

export default async function PolicyCreatedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const params = await searchParams;
  const sessionId = params.session_id;
  if (!sessionId) redirect("/quote");

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Payment not completed
        </h1>
        <p className="text-sm text-muted-foreground">
          Stripe reports this session as {session.payment_status}. If you
          finished paying, refresh in a moment.
        </p>
        <Button nativeButton={false} render={<Link href="/quote" />}>
          Back to quote
        </Button>
      </div>
    );
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const appOrigin = `${proto}://${host}`;
  const { policyId } = await ensurePolicyFromSession(session, { appOrigin });

  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.id, policyId))
    .limit(1);

  const [flight] = await db
    .select()
    .from(flights)
    .where(eq(flights.id, policy.flightId))
    .limit(1);

  return (
    <div className="mx-auto max-w-md space-y-6 pt-8">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-8 text-green-600" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Policy active
        </h1>
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <div className="text-xs text-muted-foreground">Flight</div>
          <div className="font-medium">
            {flight.iata} · {flight.origin} → {flight.destination}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {flight.scheduledDepAt.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Premium paid</div>
          <div className="text-2xl font-semibold tracking-tight">
            ${(policy.premiumCents / 100).toFixed(2)}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          We&apos;ll watch this flight from departure. Payouts trigger
          automatically if delays cross the tier ladder.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          nativeButton={false}
          render={<Link href="/policies" />}
        >
          All policies
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          nativeButton={false}
          render={<Link href="/quote" />}
        >
          Insure another
        </Button>
      </div>
    </div>
  );
}
