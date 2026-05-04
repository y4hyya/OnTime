import { headers } from "next/headers";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { ensurePolicyFromSession } from "@/server/checkout";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();

  const sig = (await headers()).get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("STRIPE_WEBHOOK_SECRET is not set", { status: 500 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Signature verification failed: ${msg}`, {
      status: 400,
    });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const host = (await headers()).get("host") ?? "localhost:3000";
      const proto =
        (await headers()).get("x-forwarded-proto") ?? "http";
      const appOrigin = `${proto}://${host}`;
      await ensurePolicyFromSession(event.data.object, { appOrigin });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Webhook handler error:", msg);
    return new Response(`Handler error: ${msg}`, { status: 500 });
  }

  return new Response("ok");
}
