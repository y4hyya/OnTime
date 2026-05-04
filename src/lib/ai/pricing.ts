import { TIER_MULTIPLIERS } from "./tiers";

const DEFAULT_ON_TIME_RATE = 0.85;
const MARGIN_MULTIPLIER = 1.3;
const MIN_PREMIUM_CENTS = 50;
const RISK_FLOOR = 0.02;
const RISK_CEILING = 0.95;

// Likelihood weights: P(tier) ≈ riskScore × weight, clamped.
// Tiers in order: 30+ min, 60+ min, 120+ min, cancelled.
// Weights respect P(longer delay) ≤ P(shorter delay).
const TIER_WEIGHTS = [1.0, 0.5, 0.15, 0.04] as const;

export type PricingInputs = {
  scheduledDepAt: Date;
  /** Per-route on-time rate (0..1). Defaults to 0.85 — placeholder until we have a real route table. */
  onTimeRate?: number;
};

export type PricingComponents = {
  base: number;
  dayOfWeek: number;
  hour: number;
  season: number;
};

export type TierProbability = {
  label: string;
  multiplier: number;
  probability: number;
};

export type PricingBreakdown = {
  riskScore: number;
  components: PricingComponents;
  tierProbabilities: TierProbability[];
  expectedPayoutPerDollar: number;
  marginMultiplier: number;
};

export type PricingResult = {
  premiumCents: number;
  breakdown: PricingBreakdown;
};

export function priceFlight(input: PricingInputs): PricingResult {
  const onTimeRate = input.onTimeRate ?? DEFAULT_ON_TIME_RATE;
  const base = clamp(1 - onTimeRate, 0, RISK_CEILING);

  const dayOfWeek = dayOfWeekAdjustment(input.scheduledDepAt);
  const hour = hourAdjustment(input.scheduledDepAt);
  const season = seasonAdjustment(input.scheduledDepAt);

  const riskScore = clamp(
    base + dayOfWeek + hour + season,
    RISK_FLOOR,
    RISK_CEILING,
  );

  const probs = tierProbabilities(riskScore);
  const expectedPayoutPerDollar = TIER_MULTIPLIERS.reduce(
    (sum, tier, i) => sum + probs[i] * tier.multiplier,
    0,
  );

  const premiumCents = Math.max(
    MIN_PREMIUM_CENTS,
    Math.round(expectedPayoutPerDollar * MARGIN_MULTIPLIER * 100),
  );

  return {
    premiumCents,
    breakdown: {
      riskScore,
      components: { base, dayOfWeek, hour, season },
      tierProbabilities: TIER_MULTIPLIERS.map((tier, i) => ({
        label: "kind" in tier ? "Cancelled" : `${tier.thresholdMinutes}+ min`,
        multiplier: tier.multiplier,
        probability: probs[i],
      })),
      expectedPayoutPerDollar,
      marginMultiplier: MARGIN_MULTIPLIER,
    },
  };
}

function tierProbabilities(risk: number): number[] {
  return TIER_WEIGHTS.map((w) => clamp(risk * w, 0, RISK_CEILING));
}

function dayOfWeekAdjustment(date: Date): number {
  const dow = date.getUTCDay();
  if (dow === 1 || dow === 5) return 0.04;
  if (dow === 0 || dow === 6) return -0.02;
  return 0;
}

function hourAdjustment(date: Date): number {
  const hour = date.getUTCHours();
  if (hour >= 16 && hour < 23) return 0.06;
  if (hour >= 6 && hour < 10) return 0.04;
  if (hour >= 23 || hour < 5) return -0.03;
  return 0;
}

function seasonAdjustment(date: Date): number {
  const month = date.getUTCMonth();
  if (month === 11 || month === 0 || month === 1) return 0.15;
  if (month >= 5 && month <= 7) return 0.03;
  return 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
