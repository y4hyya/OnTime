import { describe, expect, test } from "vitest";
import { priceFlight } from "./pricing";

describe("priceFlight", () => {
  test("default inputs (Wed mid-day spring, 0.85 on-time) returns ~$1", () => {
    const result = priceFlight({
      scheduledDepAt: new Date("2026-04-15T12:00:00Z"),
    });
    expect(result.premiumCents).toBeGreaterThanOrEqual(50);
    expect(result.premiumCents).toBeLessThanOrEqual(200);
    expect(result.breakdown.marginMultiplier).toBe(1.3);
  });

  test("reliable HND-NRT-style shuttle (high on-time, off-peak summer Tue) is small", () => {
    const result = priceFlight({
      scheduledDepAt: new Date("2026-08-04T03:00:00Z"),
      onTimeRate: 0.92,
    });
    expect(result.premiumCents).toBeGreaterThanOrEqual(50);
    expect(result.premiumCents).toBeLessThanOrEqual(200);
  });

  test("winter JFK-LAX-style flight (low on-time, Fri evening peak, Jan) returns $3-5", () => {
    const result = priceFlight({
      scheduledDepAt: new Date("2026-01-16T22:00:00Z"),
      onTimeRate: 0.7,
    });
    expect(result.premiumCents).toBeGreaterThanOrEqual(300);
    expect(result.premiumCents).toBeLessThanOrEqual(600);
  });

  test("lower on-time rate produces higher premium (all else equal)", () => {
    const date = new Date("2026-04-15T12:00:00Z");
    const reliable = priceFlight({ scheduledDepAt: date, onTimeRate: 0.95 });
    const risky = priceFlight({ scheduledDepAt: date, onTimeRate: 0.6 });
    expect(risky.premiumCents).toBeGreaterThan(reliable.premiumCents);
  });

  test("breakdown surfaces all four tier probabilities and component adjustments", () => {
    const result = priceFlight({
      scheduledDepAt: new Date("2026-04-15T12:00:00Z"),
    });
    expect(result.breakdown.tierProbabilities).toHaveLength(4);
    expect(result.breakdown.tierProbabilities[0].label).toBe("30+ min");
    expect(result.breakdown.tierProbabilities[0].multiplier).toBe(2);
    expect(result.breakdown.tierProbabilities[3].label).toBe("Cancelled");
    expect(result.breakdown.tierProbabilities[3].multiplier).toBe(20);
    expect(result.breakdown.components.base).toBeCloseTo(0.15, 5);
  });

  test("never falls below the 50-cent floor even for ideal flights", () => {
    const result = priceFlight({
      scheduledDepAt: new Date("2026-04-15T03:00:00Z"),
      onTimeRate: 0.99,
    });
    expect(result.premiumCents).toBeGreaterThanOrEqual(50);
  });
});
