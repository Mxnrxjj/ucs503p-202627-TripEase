import { describe, expect, it } from "vitest";
import {
  activityCost,
  buildSavingsSuggestions,
  computeBudgetBreakdown,
  hotelCost,
  isPricedPerPerson,
  partySize,
  roomsFor,
} from "@/lib/services/budget-engine";
import type { Activity, ActivityCategory, City, TripDay } from "@/types/itinerary";
import type { BudgetBreakdown } from "@/types/budget";

function activity(id: string, cost: number, currency: string): Activity {
  return {
    id,
    name: `Activity ${id}`,
    category: "sightseeing",
    time: "10:00",
    durationMinutes: 60,
    description: "",
    estimatedCost: cost,
    currency,
    referenceUrl: null,
    isDemoData: false,
  } as Activity;
}

function days(count: number, activities: Activity[] = []): TripDay[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `day-${i + 1}`,
    dayNumber: i + 1,
    date: `2026-12-0${i + 1}`,
    cityId: "c1",
    activities: i === 0 ? activities : [],
  }));
}

function breakdown(currency: string, total: number, estimatedTotal: number): BudgetBreakdown {
  return {
    currency,
    total,
    estimatedTotal,
    categories: {
      flights: 0,
      hotels: 0,
      food: 0,
      activities: 0,
      transport: 0,
      shopping: 0,
      misc: 0,
      buffer: 0,
    },
  };
}

describe("computeBudgetBreakdown currency", () => {
  it("keeps the rupee numbers for an INR trip", () => {
    const result = computeBudgetBreakdown({
      cities: [],
      days: days(3),
      travelers: 2,
      currency: "INR",
      userBudget: 20_000,
      flightCostTotal: 0,
    });
    expect(result.categories.transport).toBe(1_500); // 3 days x 500
    expect(result.categories.buffer).toBe(3_000); // 5% of 20,000 is 1,000, so the minimum wins
  });

  it("scales the daily transport allowance to the trip currency", () => {
    const result = computeBudgetBreakdown({
      cities: [],
      days: days(3),
      travelers: 2,
      currency: "USD",
      userBudget: 1_500,
      flightCostTotal: 0,
    });
    expect(result.categories.transport).toBe(18); // 3 days x $6, not 3 x $500
  });

  it("uses a small minimum buffer for a USD trip", () => {
    const result = computeBudgetBreakdown({
      cities: [],
      days: days(1),
      travelers: 1,
      currency: "USD",
      userBudget: 400,
      flightCostTotal: 0,
    });
    expect(result.categories.buffer).toBe(36); // 5% of 400 is 20, so the 3,000 rupee minimum (about $36) wins
  });

  it("does not let the minimum buffer swallow a small USD budget", () => {
    const result = computeBudgetBreakdown({
      cities: [],
      days: days(5),
      travelers: 2,
      currency: "USD",
      userBudget: 1_500,
      flightCostTotal: 0,
    });
    expect(result.categories.buffer).toBe(75); // 5% of 1,500
    expect(result.estimatedTotal).toBeLessThan(result.total);
  });
});

describe("buildSavingsSuggestions currency", () => {
  it("treats a $100 activity as pricey on a USD trip", () => {
    const trip = days(1, [activity("big", 100, "USD")]);
    const result = buildSavingsSuggestions([], trip, breakdown("USD", 50, 500), 1);
    expect(result.some((s) => s.kind === "activity-swap")).toBe(true);
  });

  it("does not call a $10 activity pricey on a USD trip", () => {
    const trip = days(1, [activity("small", 10, "USD")]);
    const result = buildSavingsSuggestions([], trip, breakdown("USD", 50, 500), 1);
    expect(result.some((s) => s.kind === "activity-swap")).toBe(false);
  });

  it("keeps the 1,500 rupee threshold for an INR trip", () => {
    const pricey = buildSavingsSuggestions([], days(1, [activity("a", 2_000, "INR")]), breakdown("INR", 5_000, 9_000), 1);
    const cheap = buildSavingsSuggestions([], days(1, [activity("b", 1_000, "INR")]), breakdown("INR", 5_000, 9_000), 1);
    expect(pricey.some((s) => s.kind === "activity-swap")).toBe(true);
    expect(cheap.some((s) => s.kind === "activity-swap")).toBe(false);
  });
});

function city(id: string, name: string, pricePerNight: number, nights: number): City {
  return {
    id,
    name,
    country: "Testland",
    order: 0,
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    dayCount: 2,
    imageQuery: name,
    hotel: { name: `${name} Hotel`, pricePerNight, currency: "INR", nights, referenceUrl: null, isDemoData: false },
  };
}

describe("buildSavingsSuggestions choices", () => {
  const over = breakdown("INR", 5_000, 20_000);

  it.each(["food", "transport", "nightlife", "shopping"] as const)(
    "never suggests a shared tour for a %s activity, however much it costs",
    (category) => {
      const trip = days(1, [{ ...activity("x", 5_000, "INR"), category }]);
      expect(buildSavingsSuggestions([], trip, over, 1).some((s) => s.kind === "activity-swap")).toBe(false);
    },
  );

  it.each(["sightseeing", "culture", "adventure", "beach", "relaxation"] as const)(
    "suggests a shared tour for a pricey %s activity",
    (category) => {
      const trip = days(1, [{ ...activity("x", 5_000, "INR"), category }]);
      expect(buildSavingsSuggestions([], trip, over, 1).some((s) => s.kind === "activity-swap")).toBe(true);
    },
  );

  it("picks the pricey sight, not the dearer transfer", () => {
    const trip = days(1, [{ ...activity("transfer", 9_000, "INR"), category: "transport" }, activity("sight", 3_000, "INR")]);
    const swap = buildSavingsSuggestions([], trip, over, 1).find((s) => s.kind === "activity-swap");
    expect(swap?.targetId).toBe("sight");
  });

  it("looks only at cities where the traveller sleeps for the cheaper-hotel tip", () => {
    const cities = [city("delhi", "Delhi", 3_500, 2), city("agra", "Agra", 9_000, 0)];
    const hotel = buildSavingsSuggestions(cities, days(1), over, 1).find((s) => s.kind === "hotel-downgrade");
    expect(hotel?.targetId).toBe("delhi");
  });

  it("gives no cheaper-hotel tip when no city has a night to save on", () => {
    const hotel = buildSavingsSuggestions([city("agra", "Agra", 9_000, 0)], days(1), over, 1).find((s) => s.kind === "hotel-downgrade");
    expect(hotel).toBeUndefined();
  });
});

describe("party size and rooms", () => {
  it.each([
    [1, 1],
    [2, 2],
    [8, 8],
    [20, 20],
    [2.7, 2],
    [0, 1],
    [-3, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])("party of %s counts as %s", (travelers, expected) => {
    expect(partySize(travelers)).toBe(expected);
  });

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [8, 4],
    [19, 10],
    [20, 10],
    [0, 1],
    [Number.NaN, 1],
  ])("%s travellers need %s rooms, two to a room", (travelers, rooms) => {
    expect(roomsFor(travelers)).toBe(rooms);
  });

  it("charges a hotel for every room and every night", () => {
    expect(hotelCost({ pricePerNight: 3_500, nights: 3 }, 4)).toBe(3_500 * 3 * 2);
    expect(hotelCost({ pricePerNight: 3_500, nights: 3 }, 1)).toBe(3_500 * 3);
    expect(hotelCost({ pricePerNight: 3_500, nights: 0 }, 8)).toBe(0);
  });
});

describe("what is priced per person", () => {
  const of = (category: string, estimatedCost = 1_000) => ({ category: category as ActivityCategory, estimatedCost });

  it.each(["food", "sightseeing", "adventure", "beach", "culture", "relaxation", "nightlife"])(
    "%s is per person, so it is paid once for each traveller",
    (category) => {
      expect(isPricedPerPerson(of(category))).toBe(true);
      expect(activityCost(of(category), 4)).toBe(4_000);
    },
  );

  it.each(["transport", "shopping", "something-new"])("%s is one cost for the whole party", (category) => {
    expect(isPricedPerPerson(of(category))).toBe(false);
    expect(activityCost(of(category), 4)).toBe(1_000);
  });

  it("leaves a free place free", () => {
    expect(activityCost(of("sightseeing", 0), 8)).toBe(0);
  });
});

describe("computeBudgetBreakdown for a group", () => {
  const meal = (id: string, cost: number): Activity => ({ ...activity(id, cost, "INR"), category: "food" });
  const sight = (id: string, cost: number): Activity => activity(id, cost, "INR");
  const transfer = (id: string, cost: number): Activity => ({ ...activity(id, cost, "INR"), category: "transport" });
  const shop = (id: string, cost: number): Activity => ({ ...activity(id, cost, "INR"), category: "shopping" });
  const hotelCity = (pricePerNight: number, nights: number): City =>
    ({ id: "c1", name: "Agra", hotel: { name: "H", pricePerNight, nights, currency: "INR" } }) as City;

  const build = (travelers: number) =>
    computeBudgetBreakdown({
      cities: [hotelCity(3_500, 3)],
      days: days(3, [meal("m", 900), sight("s", 1_000), transfer("t", 6_000), shop("p", 500)]),
      travelers,
      currency: "INR",
      userBudget: 1_00_000,
      flightCostTotal: 40_000,
    });

  it("is unchanged for one traveller", () => {
    const one = build(1);
    expect(one.categories).toMatchObject({ hotels: 10_500, food: 900, activities: 1_000, transport: 6_000 + 1_500, shopping: 500 });
  });

  it("gives 8 people twice the rooms and twice the meals and tickets of 4, and nothing else more", () => {
    // The scenario from the diagnostics: before, 4 friends and 8 family members paid the same.
    const four = build(4).categories;
    const eight = build(8).categories;
    expect(four.hotels).toBe(3_500 * 3 * 2);
    expect(eight.hotels).toBe(3_500 * 3 * 4);
    expect(four.food).toBe(900 * 4);
    expect(eight.food).toBe(900 * 8);
    expect(four.activities).toBe(1_000 * 4);
    expect(eight.activities).toBe(1_000 * 8);
    // Already a group price (a transfer), or a group cost (local transport, shopping), and the fare as quoted.
    expect(eight.transport).toBe(four.transport);
    expect(eight.shopping).toBe(four.shopping);
    expect(eight.flights).toBe(four.flights);
  });

  it("charges an odd-sized party for the extra room", () => {
    expect(build(3).categories.hotels).toBe(3_500 * 3 * 2);
  });

  it("works out misc on the group's costs, and adds the categories up to the total", () => {
    const four = build(4);
    const c = four.categories;
    const subtotal = c.flights + c.hotels + c.food + c.activities + c.transport + c.shopping;
    expect(c.misc).toBe(Math.round(subtotal * 0.04));
    expect(four.estimatedTotal).toBe(Object.values(c).reduce((a, b) => a + b, 0));
  });

  it("treats a missing traveller count as one person, never as zero", () => {
    const odd = computeBudgetBreakdown({
      cities: [hotelCity(3_500, 3)],
      days: days(1, [meal("m", 900)]),
      travelers: undefined as unknown as number,
      currency: "INR",
      userBudget: 50_000,
      flightCostTotal: 0,
    });
    expect(odd.categories.hotels).toBe(10_500);
    expect(odd.categories.food).toBe(900);
    expect(Number.isFinite(odd.estimatedTotal)).toBe(true);
  });
});

describe("ways to save, for a group", () => {
  const over = breakdown("INR", 10_000, 50_000);
  const hotelCity = (id: string, pricePerNight: number, nights: number): City =>
    ({ id, name: id, hotel: { name: `${id} Hotel`, pricePerNight, nights, currency: "INR" } }) as City;

  it("saves on every room the party books", () => {
    const one = buildSavingsSuggestions([hotelCity("Agra", 4_000, 2)], days(1), over, 1).find((s) => s.kind === "hotel-downgrade");
    const six = buildSavingsSuggestions([hotelCity("Agra", 4_000, 2)], days(1), over, 6).find((s) => s.kind === "hotel-downgrade");
    expect(one?.estimatedSavings).toBe(Math.round(4_000 * 2 * 0.3));
    expect(six?.estimatedSavings).toBe(Math.round(4_000 * 2 * 3 * 0.3));
  });

  it("saves on every ticket when a tour is shared", () => {
    const trip = days(1, [activity("tour", 2_000, "INR")]);
    const swap = buildSavingsSuggestions([], trip, over, 4).find((s) => s.kind === "activity-swap");
    expect(swap?.estimatedSavings).toBe(Math.round(2_000 * 4 * 0.6));
  });

  it("still judges a tour pricey by its price for one person", () => {
    // 1,200 a head is under the threshold however many go, so no swap is offered.
    const trip = days(1, [activity("walk", 1_200, "INR")]);
    expect(buildSavingsSuggestions([], trip, over, 8).some((s) => s.kind === "activity-swap")).toBe(false);
  });
});
