import { describe, expect, it } from "vitest";
import { splitDaysAcrossCities } from "@/lib/services/planning/split-days";
import { validateCityAllocation } from "@/lib/services/planning/validate";
import type { CityAllocation } from "@/types/planning";

/**
 * The rules behind the "Edit cities" dialog. The dialog rebalances with
 * `splitDaysAcrossCities` and gates saving on `validateCityAllocation`, so
 * these cover add / remove / rebalance / duplicate / total-days behaviour
 * against the same functions the UI and the server both use.
 */
const trip = { destination: "Italy", dayCount: 9, travelers: 2, budget: 150_000 };

function cities(...entries: [string, number][]): CityAllocation[] {
  return entries.map(([name, days]) => ({ name, days, reason: "" }));
}

/** Mirrors the dialog's rebalance step. */
function rebalance(list: CityAllocation[], dayCount: number): CityAllocation[] {
  const days = splitDaysAcrossCities(dayCount, list.map((c) => Math.max(1, c.days)));
  return list.map((city, i) => ({ ...city, days: days[i] }));
}

describe("adding a city", () => {
  it("rebalances so the days still total the trip length", () => {
    const before = cities(["Rome", 5], ["Florence", 4]);
    const after = rebalance([...before, { name: "Naples", days: 1, reason: "" }], 9);

    expect(after).toHaveLength(3);
    expect(after.reduce((s, c) => s + c.days, 0)).toBe(9);
    expect(validateCityAllocation(after, trip).ok).toBe(true);
  });

  it("gives the new city at least one day", () => {
    const after = rebalance([...cities(["Rome", 8]), { name: "Naples", days: 1, reason: "" }], 9);
    expect(after.every((c) => c.days >= 1)).toBe(true);
  });
});

describe("removing a city", () => {
  it("redistributes the removed city's days to the rest", () => {
    const before = cities(["Rome", 4], ["Florence", 3], ["Naples", 2]);
    const after = rebalance(before.filter((c) => c.name !== "Florence"), 9);

    expect(after.map((c) => c.name)).toEqual(["Rome", "Naples"]);
    expect(after.reduce((s, c) => s + c.days, 0)).toBe(9);
    expect(validateCityAllocation(after, trip).ok).toBe(true);
  });

  it("hands the whole trip to the last remaining city", () => {
    const after = rebalance(cities(["Rome", 4]), 9);
    expect(after).toEqual([expect.objectContaining({ name: "Rome", days: 9 })]);
  });
});

describe("rejected edits", () => {
  it("rejects a total that doesn't match the trip length", () => {
    expect(validateCityAllocation(cities(["Rome", 4], ["Florence", 3]), trip).ok).toBe(false);
    expect(validateCityAllocation(cities(["Rome", 6], ["Florence", 6]), trip).ok).toBe(false);
  });

  it("rejects a duplicate city name", () => {
    const result = validateCityAllocation(cities(["Rome", 5], ["Rome", 4]), trip);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.some((p) => p.includes("more than once"))).toBe(true);
  });

  it("rejects a zero-day or negative-day city", () => {
    expect(validateCityAllocation(cities(["Rome", 9], ["Florence", 0]), trip).ok).toBe(false);
    expect(validateCityAllocation(cities(["Rome", 10], ["Florence", -1]), trip).ok).toBe(false);
  });

  it("rejects an unnamed city", () => {
    expect(validateCityAllocation(cities(["Rome", 5], ["", 4]), trip).ok).toBe(false);
  });

  it("rejects more cities than days", () => {
    const shortTrip = { ...trip, dayCount: 2 };
    expect(validateCityAllocation(cities(["A", 1], ["B", 1], ["C", 1]), shortTrip).ok).toBe(false);
  });
});

describe("renaming a city", () => {
  it("stays valid when only the name changes", () => {
    const renamed = cities(["Roma", 4], ["Florence", 3], ["Naples", 2]);
    expect(validateCityAllocation(renamed, trip).ok).toBe(true);
  });

  it("still catches a rename that collides with another city", () => {
    const collided = cities(["Florence", 4], ["Florence", 3], ["Naples", 2]);
    expect(validateCityAllocation(collided, trip).ok).toBe(false);
  });
});
