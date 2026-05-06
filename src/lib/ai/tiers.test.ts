import { describe, expect, it } from "vitest";
import { CANCELLED_TIER_INDEX, computeTriggeredTier } from "./tiers";

const SCHED = new Date("2026-06-01T12:00:00Z");
const minutesAfter = (n: number) => new Date(SCHED.getTime() + n * 60_000);

describe("computeTriggeredTier", () => {
  it("returns null when there is no actual departure and not cancelled", () => {
    expect(
      computeTriggeredTier({
        status: "scheduled",
        scheduledDepAt: SCHED,
        actualDepAt: null,
      }),
    ).toBeNull();
  });

  it("returns null for an on-time or early departure", () => {
    expect(
      computeTriggeredTier({
        status: "departed",
        scheduledDepAt: SCHED,
        actualDepAt: SCHED,
      }),
    ).toBeNull();
    expect(
      computeTriggeredTier({
        status: "departed",
        scheduledDepAt: SCHED,
        actualDepAt: minutesAfter(-15),
      }),
    ).toBeNull();
  });

  it("returns null for a delay shorter than the first tier", () => {
    expect(
      computeTriggeredTier({
        status: "departed",
        scheduledDepAt: SCHED,
        actualDepAt: minutesAfter(29),
      }),
    ).toBeNull();
  });

  it("returns tier 0 at exactly 30 minutes", () => {
    expect(
      computeTriggeredTier({
        status: "departed",
        scheduledDepAt: SCHED,
        actualDepAt: minutesAfter(30),
      }),
    ).toEqual({ tierIndex: 0, delayMinutes: 30 });
  });

  it("returns tier 1 at 60 minutes and tier 2 at 120 minutes", () => {
    expect(
      computeTriggeredTier({
        status: "delayed",
        scheduledDepAt: SCHED,
        actualDepAt: minutesAfter(75),
      }),
    ).toEqual({ tierIndex: 1, delayMinutes: 75 });
    expect(
      computeTriggeredTier({
        status: "delayed",
        scheduledDepAt: SCHED,
        actualDepAt: minutesAfter(180),
      }),
    ).toEqual({ tierIndex: 2, delayMinutes: 180 });
  });

  it("returns the cancelled tier regardless of time fields", () => {
    expect(
      computeTriggeredTier({
        status: "cancelled",
        scheduledDepAt: SCHED,
        actualDepAt: null,
      }),
    ).toEqual({ tierIndex: CANCELLED_TIER_INDEX, delayMinutes: null });
  });

  it("prefers the cancelled tier over a logged delay", () => {
    expect(
      computeTriggeredTier({
        status: "cancelled",
        scheduledDepAt: SCHED,
        actualDepAt: minutesAfter(45),
      }),
    ).toEqual({ tierIndex: CANCELLED_TIER_INDEX, delayMinutes: null });
  });
});
