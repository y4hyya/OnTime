import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { flights, policies, quotes } from "@/lib/db/schema";
import { sendPolicyCreatedEmail } from "@/lib/email/resend";

export type EnsurePolicyResult = {
  policyId: string;
  created: boolean;
};

export type EnsurePolicyOptions = {
  /** Absolute origin (e.g. https://ontime.app) used to build the email's policy link. */
  appOrigin?: string;
};

/**
 * Idempotently create a Policy row for a successfully-paid Stripe Checkout
 * Session. Safe to call from both the webhook and the success-page polling
 * fallback — first caller wins, second caller no-ops.
 */
export async function ensurePolicyFromSession(
  session: Stripe.Checkout.Session,
  options: EnsurePolicyOptions = {},
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

  await notifyPolicyCreated({
    policyId: policyRow.id,
    flightId,
    premiumCents,
    session,
    appOrigin: options.appOrigin,
  });

  return { policyId: policyRow.id, created: true };
}

async function notifyPolicyCreated(input: {
  policyId: string;
  flightId: string;
  premiumCents: number;
  session: Stripe.Checkout.Session;
  appOrigin?: string;
}): Promise<void> {
  try {
    const recipient = input.session.customer_details?.email;
    if (!recipient) {
      console.warn(
        "Stripe session has no customer_details.email; skipping policy email.",
      );
      return;
    }

    const [flight] = await db
      .select()
      .from(flights)
      .where(eq(flights.id, input.flightId))
      .limit(1);
    if (!flight) {
      console.warn(`Flight ${input.flightId} not found; skipping policy email.`);
      return;
    }

    const origin =
      input.appOrigin ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    await sendPolicyCreatedEmail({
      to: recipient,
      iata: flight.iata ?? flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      scheduledDepAt: flight.scheduledDepAt,
      premiumCents: input.premiumCents,
      policyUrl: `${origin}/policies/${input.policyId}`,
    });
  } catch (e) {
    console.error("Policy-created email failed:", e);
  }
}
