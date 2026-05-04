import Link from "next/link";
import { Show, SignInButton } from "@clerk/nextjs";
import { Bot, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TierTable } from "@/components/marketing/TierTable";

export default function Home() {
  return (
    <>
      <section className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Get coffee money when your flight is late.
          </h1>
          <p className="mt-6 text-balance text-lg text-muted-foreground">
            AI-priced parametric flight insurance. Tiny premiums, automatic
            payouts the moment your flight slips past 30 minutes — no claim
            forms, no waiting.
          </p>
          <div className="mt-8">
            <Show
              when="signed-out"
              fallback={
                <Button
                  size="lg"
                  nativeButton={false}
                  render={<Link href="/quote" />}
                >
                  Get a quote
                </Button>
              }
            >
              <SignInButton mode="modal" forceRedirectUrl="/quote">
                <Button size="lg">Get a quote</Button>
              </SignInButton>
            </Show>
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-16 sm:grid-cols-3">
          <Feature
            icon={Zap}
            title="30-second AI quote"
            description="Describe your flight in plain English. Our AI prices it on the spot."
          />
          <Feature
            icon={Wallet}
            title="Automatic payouts"
            description="The moment a delay tier triggers, your payout fires."
          />
          <Feature
            icon={Bot}
            title="No claim forms"
            description="No paperwork, no phone calls. The flight data is the claim."
          />
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="text-balance text-center text-3xl font-semibold tracking-tight">
            One simple ladder, every flight.
          </h2>
          <p className="mt-3 text-balance text-center text-muted-foreground">
            The AI sets your premium based on the flight&apos;s risk. Payout
            multipliers stay fixed and visible up-front.
          </p>
          <div className="mt-10">
            <TierTable />
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Step n={1} title="Tell us your flight">
              Paste a flight number or describe your trip. The AI looks it up.
            </Step>
            <Step n={2} title="Get an instant quote">
              You see the premium and the full payout ladder before you buy.
            </Step>
            <Step n={3} title="Auto-payout if delayed">
              We watch the flight. When a tier triggers, your payout lands.
            </Step>
          </ol>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            Why we built this
          </h2>
          <p className="mt-4 text-muted-foreground">
            Vienna airport, mid-afternoon, two hours of delay. Sitting in one of
            those uncomfortable plastic chairs, I realized I&apos;d gladly have
            paid a couple of dollars to insure even thirty minutes of this — to
            be in the Starbucks across the gate with a coffee instead. Existing
            flight insurance only kicks in past three hours or on cancellations.
            Nobody covers the ordinary Wednesday-afternoon delay. So we did.
          </p>
        </div>
      </section>
    </>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <Icon className="size-6 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="space-y-2">
      <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground">
        {n}
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{children}</p>
    </li>
  );
}
