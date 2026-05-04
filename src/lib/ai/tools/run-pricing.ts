import type { FunctionDeclaration } from "@google/genai";
import { priceFlight } from "@/lib/ai/pricing";

export const runPricingTool: FunctionDeclaration = {
  name: "run_pricing",
  description:
    "Compute the premium for a flight. Call this after lookup_flight succeeds. Returns the premium plus pre-computed payouts for each tier (so you don't need to multiply yourself).",
  parametersJsonSchema: {
    type: "object",
    properties: {
      scheduledDepAt: {
        type: "string",
        description:
          "Scheduled departure as ISO 8601 UTC. Use the value from lookup_flight's flight.scheduledDepAt field.",
      },
      onTimeRate: {
        type: "number",
        description:
          "Optional per-route on-time rate (0..1). Omit unless you have specific reason to override; defaults to 0.85.",
        minimum: 0,
        maximum: 1,
      },
    },
    required: ["scheduledDepAt"],
  },
};

type PricingInput = { scheduledDepAt: string; onTimeRate?: number };

export function runPricingHandler(input: unknown): unknown {
  const { scheduledDepAt, onTimeRate } = input as PricingInput;
  const date = new Date(scheduledDepAt);
  if (Number.isNaN(date.getTime())) {
    return { error: `Invalid scheduledDepAt: ${scheduledDepAt}` };
  }
  const result = priceFlight({ scheduledDepAt: date, onTimeRate });
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  return {
    premiumCents: result.premiumCents,
    premiumDollars: dollars(result.premiumCents),
    payouts: result.breakdown.tierProbabilities.map((t) => ({
      tier: t.label,
      multiplier: t.multiplier,
      payoutCents: result.premiumCents * t.multiplier,
      payoutDollars: dollars(result.premiumCents * t.multiplier),
    })),
    riskScore: result.breakdown.riskScore,
    components: result.breakdown.components,
  };
}
