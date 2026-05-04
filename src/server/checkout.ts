import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { policies, quotes } from "@/lib/db/schema";

export type EnsurePolicyResult = {
  policyId: string;
  created: boolean;
};

/**
 * Idempotently create a Policy row for a successfully-paid Stripe Checkout
 * Session. Safe to call from both the webhook and the success-page polling
 * fallback — first caller wins, second caller no-ops.
 */
export async function ensurePolicyFromSession(
  session: Stripe.Checkout.Session,
): Promise<EnsurePolicyResult> {
  if (session.payment_status !== "paid") {
    throw new Error(
      `Session payment_status is "${session.payment_status}", expected "paid".`,
    );
  }

  const stripePaymentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  if (!stripePaymentId) {
    throw new Error("Session has no payment_intent.");
  }

  const meta = session.metadata ?? {};
  const userClerkId = meta.userClerkId;
  const flightId = meta.flightId;
  const quoteId = meta.quoteId;
  if (!userClerkId || !flightId || !quoteId) {
    throw new Error(
      "Session metadata is missing one of: userClerkId, flightId, quoteId.",
    );
  }

  const existing = await db
    .select({ id: policies.id })
    .from(policies)
    .where(eq(policies.stripePaymentId, stripePaymentId))
    .limit(1);

  if (existing.length > 0) {
    return { policyId: existing[0].id, created: false };
  }

  const premiumCents = session.amount_total ?? 0;

  const [policyRow] = await db
    .insert(policies)
    .values({
      userClerkId,
      flightId,
      premiumCents,
      coverageType: "parametric_delay",
      status: "active",
      stripePaymentId,
    })
    .returning({ id: policies.id });

  await db
    .update(quotes)
    .set({ acceptedAt: new Date() })
    .where(eq(quotes.id, quoteId));

  return { policyId: policyRow.id, created: true };
}
