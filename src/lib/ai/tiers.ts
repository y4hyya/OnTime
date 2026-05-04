export type DelayTier =
  | { thresholdMinutes: number; multiplier: number }
  | { kind: "cancelled"; multiplier: number };

export const TIER_MULTIPLIERS = [
  { thresholdMinutes: 30, multiplier: 2 },
  { thresholdMinutes: 60, multiplier: 3 },
  { thresholdMinutes: 120, multiplier: 6 },
  { kind: "cancelled", multiplier: 20 },
] as const satisfies readonly DelayTier[];

export const T_MINUS_2H_CUTOFF_MS = 2 * 60 * 60 * 1000;

export function tierLabel(tier: DelayTier): string {
  return "kind" in tier ? "Cancelled" : `${tier.thresholdMinutes}+ min`;
}
