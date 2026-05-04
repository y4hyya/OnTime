"use server";

import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { quotes } from "@/lib/db/schema";
import { getFlight } from "@/lib/flights/cache";
import { priceFlight } from "@/lib/ai/pricing";
import { getStripe } from "@/lib/payments/stripe";
import { T_MINUS_2H_CUTOFF_MS, TIER_MULTIPLIERS } from "@/lib/ai/tiers";

type CheckoutInput = {
  iata: string;
  /** ISO 8601 UTC scheduled departure, used to derive the lookup date and enforce the T-2h cutoff. */
  scheduledDepAt: string;
};

type CheckoutResult = { url: string };

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const scheduled = new Date(input.scheduledDepAt);
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error("Invalid scheduledDepAt");
  }

  if (scheduled.getTime() - Date.now() < T_MINUS_2H_CUTOFF_MS) {
    throw new Error(
      "This flight is within 2 hours of departure — policies can't be sold this close to takeoff.",
    );
  }

  const date = scheduled.toISOString().slice(0, 10);
  const flightResult = await getFlight(input.iata, date);
  if (!flightResult) {
    throw new Error("Flight not found.");
  }

  const pricing = priceFlight({
    scheduledDepAt: flightResult.data.scheduledDepAt,
  });

  const maxPayoutCents =
    pricing.premiumCents *
    TIER_MULTIPLIERS.reduce(
      (max, tier) => Math.max(max, tier.multiplier),
      0,
    );

  const [quoteRow] = await db
    .insert(quotes)
    .values({
      userClerkId: userId,
      inputJson: {
        iata: flightResult.data.iata,
        scheduledDepAt: flightResult.data.scheduledDepAt.toISOString(),
        origin: flightResult.data.origin,
        destination: flightResult.data.destination,
      },
      aiResponseJson: pricing.breakdown as unknown as Record<string, unknown>,
      premiumCents: pricing.premiumCents,
    })
    .returning({ id: quotes.id });

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `OnTime — ${flightResult.data.iata} on ${date}`,
            description: `Parametric delay coverage. Up to $${(maxPayoutCents / 100).toFixed(2)} payout if cancelled.`,
          },
          unit_amount: pricing.premiumCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      quoteId: quoteRow.id,
      userClerkId: userId,
      flightId: flightResult.id,
    },
    success_url: `${origin}/policies/new?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/quote`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url: session.url };
}
