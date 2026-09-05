import { describe, expect, it } from "vitest";
import { destinationMatches, validateCityAllocation } from "@/lib/services/planning/validate";
import type { CityAllocation } from "@/types/planning";

const request = { destination: "Italy", dayCount: 9, travelers: 2, budget: 150_000 };

function cities(...entries: [string, number][]): CityAllocation[] {
  return entries.map(([name, days]) => ({ name, days, reason: "" }));
}

describe("validateCityAllocation", () => {
  it("accepts an allocation whose days sum to the trip length", () => {
    const result = validateCityAllocation(cities(["Rome", 4], ["Florence", 3], ["Naples", 2]), request);
    expect(result.ok).toBe(true);
  });

  it("rejects an allocation that doesn't add up", () => {
    // 4 + 3 + 4 = 11 for a 9-day trip.
    const result = validateCityAllocation(cities(["Rome", 4], ["Florence", 3], ["Naples", 4]), request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.includes("add up to 11"))).toBe(true);
    }
  });

  it("rejects duplicate cities regardless of casing", () => {
    const result = validateCityAllocation(cities(["Rome", 5], ["rome", 4]), request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.toLowerCase().includes("more than once"))).toBe(true);
    }
  });

  it("rejects non-positive or fractional day counts", () => {
    expect(validateCityAllocation(cities(["Rome", 0], ["Florence", 9]), request).ok).toBe(false);
    expect(validateCityAllocation(cities(["Rome", -2], ["Florence", 11]), request).ok).toBe(false);
    expect(validateCityAllocation(cities(["Rome", 4.5], ["Florence", 4.5]), request).ok).toBe(false);
  });

  it("rejects an empty city list", () => {
    const result = validateCityAllocation([], request);
    expect(result.ok).toBe(false);
  });

  it("rejects a city with no name", () => {
    const result = validateCityAllocation(cities(["  ", 4], ["Florence", 5]), request);
    expect(result.ok).toBe(false);
  });

  it("rejects more cities than there are days", () => {
    const shortTrip = { ...request, dayCount: 2 };
    const result = validateCityAllocation(cities(["A", 1], ["B", 1], ["C", 1]), shortTrip);
    expect(result.ok).toBe(false);
  });

  it("rejects an unreasonable number of stops", () => {
    const longTrip = { ...request, dayCount: 20 };
    const many = Array.from({ length: 10 }, (_, i) => [`City ${i}`, 2] as [string, number]);
    const result = validateCityAllocation(cities(...many), longTrip);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.includes("at most"))).toBe(true);
    }
  });

  it("rejects impossible trip inputs", () => {
    const bad = { destination: "Italy", dayCount: 9, travelers: 0, budget: -5 };
    const result = validateCityAllocation(cities(["Rome", 9]), bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("destinationMatches", () => {
  it("tolerates casing and punctuation differences", () => {
    expect(destinationMatches("italy", "Italy")).toBe(true);
    expect(destinationMatches("Japan 🇯🇵", "Japan")).toBe(true);
    expect(destinationMatches("Bali", "Bali, Indonesia")).toBe(true);
  });

  it("rejects an entirely different destination", () => {
    expect(destinationMatches("France", "Italy")).toBe(false);
    expect(destinationMatches("", "Italy")).toBe(false);
  });
});
