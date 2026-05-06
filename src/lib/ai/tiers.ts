export type DelayTier =
  | { thresholdMinutes: number; multiplier: number }
  | { kind: "cancelled"; multiplier: number };

export const TIER_MULTIPLIERS = [
  { thresholdMinutes: 30, multiplier: 2 },
  { thresholdMinutes: 60, multiplier: 3 },
  { thresholdMinutes: 120, multiplier: 6 },
  { kind: "cancelled", multiplier: 20 },
] as const satisfies readonly DelayTier[];

export const CANCELLED_TIER_INDEX = 3;

export const T_MINUS_2H_CUTOFF_MS = 2 * 60 * 60 * 1000;

export function tierLabel(tier: DelayTier): string {
  return "kind" in tier ? "Cancelled" : `${tier.thresholdMinutes}+ min`;
}

export type TriggeredTier = {
  tierIndex: number;
  delayMinutes: number | null;
};

/**
 * Given a flight's current state, return the highest tier its delay/cancellation
 * has crossed, or null if no tier has triggered. Pure function, no I/O.
 *
 * Cancelled status wins over delays — even a 30-min cancelled flight returns the
 * cancelled tier (20×), since the user's flight is gone regardless of clock time.
 */
export function computeTriggeredTier(input: {
  status: string | null | undefined;
  scheduledDepAt: Date;
  actualDepAt: Date | null;
}): TriggeredTier | null {
  if (input.status === "cancelled") {
    return { tierIndex: CANCELLED_TIER_INDEX, delayMinutes: null };
  }
  if (!input.actualDepAt) return null;

  const delayMs = input.actualDepAt.getTime() - input.scheduledDepAt.getTime();
  if (delayMs <= 0) return null;
  const delayMinutes = Math.floor(delayMs / 60_000);

  let tierIndex = -1;
  for (let i = 0; i < TIER_MULTIPLIERS.length; i++) {
    const tier = TIER_MULTIPLIERS[i];
    if ("kind" in tier) continue;
    if (delayMinutes >= tier.thresholdMinutes) tierIndex = i;
  }

  return tierIndex >= 0 ? { tierIndex, delayMinutes } : null;
}
