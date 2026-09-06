import { describe, expect, it } from "vitest";
import {
  checkOpeningHours,
  estimateActivityDuration,
  parseTimeToMinutes,
  totalActivityMinutes,
} from "@/lib/services/feasibility/durations";
import type { Activity } from "@/types/itinerary";

function activity(overrides: Partial<Activity> & { id: string }): Activity {
  return {
    name: "Activity",
    category: "sightseeing",
    time: "10:00",
    durationMinutes: 0,
    description: "",
    estimatedCost: 0,
    currency: "INR",
    referenceUrl: null,
    isDemoData: true,
    ...overrides,
  };
}

describe("estimateActivityDuration", () => {
  it("trusts a real duration when one exists", () => {
    const result = estimateActivityDuration(activity({ id: "a", durationMinutes: 45 }));
    expect(result).toEqual({ minutes: 45, isEstimated: false });
  });

  it("falls back to a category default, and says that it did", () => {
    const museum = estimateActivityDuration(activity({ id: "a", category: "culture" }));
    expect(museum).toEqual({ minutes: 120, isEstimated: true });

    const meal = estimateActivityDuration(activity({ id: "b", category: "food" }));
    expect(meal.minutes).toBe(75);
    expect(meal.isEstimated).toBe(true);
  });

  it("varies the default by what kind of thing it is", () => {
    const adventure = estimateActivityDuration(activity({ id: "a", category: "adventure" })).minutes;
    const coffee = estimateActivityDuration(activity({ id: "b", category: "relaxation" })).minutes;
    expect(adventure).toBeGreaterThan(coffee);
  });

  it("ignores nonsense durations rather than propagating them", () => {
    expect(estimateActivityDuration(activity({ id: "a", durationMinutes: -30 })).isEstimated).toBe(true);
    expect(estimateActivityDuration(activity({ id: "b", durationMinutes: NaN })).isEstimated).toBe(true);
  });

  it("gives transport no time of its own", () => {
    // Transport is modelled as a travel segment; counting it here as well
    // would charge the day twice for the same journey.
    expect(estimateActivityDuration(activity({ id: "a", category: "transport" })).minutes).toBe(0);
  });
});

describe("totalActivityMinutes", () => {
  it("adds up time spent at places", () => {
    const total = totalActivityMinutes([
      activity({ id: "a", durationMinutes: 90 }),
      activity({ id: "b", durationMinutes: 60 }),
    ]);
    expect(total).toBe(150);
  });

  it("excludes transport entries", () => {
    const total = totalActivityMinutes([
      activity({ id: "a", durationMinutes: 90 }),
      activity({ id: "t", category: "transport", durationMinutes: 240 }),
    ]);
    expect(total).toBe(90);
  });

  it("is zero for an empty day", () => {
    expect(totalActivityMinutes([])).toBe(0);
  });
});

describe("parseTimeToMinutes", () => {
  it("reads itinerary times", () => {
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("9:30")).toBe(570);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes(" 21:15 ")).toBe(1275);
  });

  it("rejects anything that isn't a time", () => {
    expect(parseTimeToMinutes("morning")).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("10:75")).toBeNull();
    expect(parseTimeToMinutes("")).toBeNull();
  });
});

describe("checkOpeningHours", () => {
  it("returns unknown when hours are missing, which is the norm today", () => {
    // The Places integration doesn't request opening hours, so this is the
    // path every real activity takes right now. Missing hours must never be
    // treated as "closed".
    expect(checkOpeningHours("10:00", 90, null)).toBe("unknown");
    expect(checkOpeningHours("10:00", 90, undefined)).toBe("unknown");
  });

  it("returns unknown when the activity time can't be read", () => {
    expect(checkOpeningHours("afternoon", 90, { opensAt: 540, closesAt: 1080 })).toBe("unknown");
  });

  it("accepts a visit that fits inside known hours", () => {
    expect(checkOpeningHours("10:00", 90, { opensAt: 540, closesAt: 1080 })).toBe("open");
  });

  it("rejects a visit that starts too early or overruns closing", () => {
    expect(checkOpeningHours("08:00", 60, { opensAt: 540, closesAt: 1080 })).toBe("closed");
    expect(checkOpeningHours("17:30", 90, { opensAt: 540, closesAt: 1080 })).toBe("closed");
  });
});
