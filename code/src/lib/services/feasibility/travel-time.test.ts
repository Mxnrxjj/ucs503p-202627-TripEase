import { describe, expect, it } from "vitest";
import { HeuristicTravelTimeProvider } from "@/lib/services/feasibility/travel-time";

const provider = new HeuristicTravelTimeProvider();

const BANGKOK = { lat: 13.75, lng: 100.4913 };
const BANGKOK_NEARBY = { lat: 13.7466, lng: 100.493 }; // Wat Pho, ~500m away
const CHATUCHAK = { lat: 13.7998, lng: 100.5501 };
const PHUKET = { lat: 7.8964, lng: 98.2963 };
const ROME = { lat: 41.9028, lng: 12.4964 };
const FLORENCE = { lat: 43.7696, lng: 11.2558 };

describe("local travel estimates", () => {
  it("treats a few hundred metres as a walk", () => {
    const estimate = provider.estimate(BANGKOK, BANGKOK_NEARBY, { sameCity: true });
    expect(estimate.mode).toBe("walk");
    expect(estimate.minutes).toBeLessThan(20);
  });

  it("treats a cross-city hop as a drive taking real time", () => {
    const estimate = provider.estimate(BANGKOK, CHATUCHAK, { sameCity: true });
    expect(estimate.mode).toBe("car");
    // ~8km straight line in city traffic is far more than 8 minutes.
    expect(estimate.minutes).toBeGreaterThan(20);
    expect(estimate.minutes).toBeLessThan(60);
  });

  it("never returns a zero-minute journey", () => {
    const estimate = provider.estimate(BANGKOK, { ...BANGKOK }, { sameCity: true });
    expect(estimate.minutes).toBeGreaterThanOrEqual(5);
  });

  it("adds road detour on top of straight-line distance", () => {
    const estimate = provider.estimate(BANGKOK, CHATUCHAK, { sameCity: true });
    // Straight line is ~8km; the reported distance accounts for roads bending.
    expect(estimate.distanceKm!).toBeGreaterThan(8);
  });
});

describe("intercity transfers", () => {
  it("treats Bangkok → Phuket as a flight costing hours, not minutes", () => {
    const estimate = provider.estimate(BANGKOK, PHUKET, { sameCity: false });
    expect(estimate.mode).toBe("flight");
    // Door to door: airport, security, flight, transfer out.
    expect(estimate.minutes).toBeGreaterThan(180);
    expect(estimate.minutes).toBeLessThan(360);
  });

  it("treats Rome → Florence as a train, not a flight", () => {
    const estimate = provider.estimate(ROME, FLORENCE, { sameCity: false });
    expect(estimate.mode).toBe("train");
    expect(estimate.minutes).toBeGreaterThan(90);
    expect(estimate.minutes).toBeLessThan(240);
  });

  it("treats a nearby city as a drive", () => {
    const nearby = { lat: 41.95, lng: 12.55 };
    expect(provider.estimate(ROME, nearby, { sameCity: false }).mode).toBe("car");
  });

  it("scales with distance", () => {
    const short = provider.estimate(ROME, FLORENCE, { sameCity: false });
    const long = provider.estimate(BANGKOK, PHUKET, { sameCity: false });
    expect(long.minutes).toBeGreaterThan(short.minutes);
  });
});

describe("unknown coordinates", () => {
  it("reports no distance but still allows time for a transfer", () => {
    const estimate = provider.estimate(null, PHUKET, { sameCity: false });
    expect(estimate.distanceKm).toBeNull();
    expect(estimate.mode).toBe("unknown");
    // A city change is never instant, even when we can't measure it.
    expect(estimate.minutes).toBeGreaterThan(60);
  });

  it("uses a small allowance for an unmeasurable local hop", () => {
    const estimate = provider.estimate(null, BANGKOK, { sameCity: true });
    expect(estimate.distanceKm).toBeNull();
    expect(estimate.minutes).toBeLessThan(60);
  });
});

describe("estimate honesty", () => {
  it("always marks results as estimated", () => {
    expect(provider.estimate(ROME, FLORENCE, { sameCity: false }).isEstimated).toBe(true);
    expect(provider.estimate(null, null, { sameCity: true }).isEstimated).toBe(true);
  });
});
