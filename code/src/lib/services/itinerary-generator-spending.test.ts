import { describe, expect, it } from "vitest";
import {
  affordableNightlife,
  affordableRestaurants,
  generateItinerary,
  MIN_MEAL_CHOICES,
  sightsWithinSpending,
  spendingMoneyPerPersonPerDayInr,
  type CityPlaces,
  type PlannedStop,
} from "@/lib/services/itinerary-generator";
import { activityCost, DAILY_TRANSPORT_INR, spendableSubtotal } from "@/lib/services/budget-engine";
import { fromInr } from "@/lib/fx";
import { spendPricesFor, type SpendTier } from "@/lib/spending/prices";
import { ratedPlace, RatedPlacesProvider, type RatedResults } from "@/test-support/places/rated-provider";
import type { Activity, City, TripDay } from "@/types/itinerary";
import type { Place } from "@/types/place";
import type { CityPlan } from "@/types/planning";
import type { TripDraftInput } from "@/types/trip";

/**
 * Meals, nights out and sights are chosen to fit what the budget leaves once
 * the flights, hotels and transfers are paid for. These tests use India, so
 * places are priced with India's own figures, as Google's results would be.
 */

const india = spendPricesFor("IN").perPersonInr;

const priced = (amount: number, currency = "INR") => ({ price: { amount, currency, isEstimate: true as const } });

function restaurant(name: string, tier: SpendTier, rating = 4.4, reviews = 1_000): Place {
  return ratedPlace(name, rating, reviews, { type: "restaurant", category: "food", ...priced(india[tier]) });
}

function bar(name: string, tier: SpendTier, rating = 4.4): Place {
  return ratedPlace(name, rating, 800, { type: "nightlife", category: "nightlife", ...priced(india[tier]) });
}

/** Six of each tier, the dearer ones better rated, as a "best restaurants" search tends to return. */
const mixedRestaurants = () => [
  ...Array.from({ length: 6 }, (_, i) => restaurant(`Luxury ${i}`, "luxury", 4.8, 3_000)),
  ...Array.from({ length: 6 }, (_, i) => restaurant(`Upscale ${i}`, "upscale", 4.7, 3_000)),
  ...Array.from({ length: 6 }, (_, i) => restaurant(`Mid ${i}`, "mid", 4.5, 3_000)),
  ...Array.from({ length: 6 }, (_, i) => restaurant(`Cheap ${i}`, "budget", 4.3, 3_000)),
];

const sights = () => Array.from({ length: 16 }, (_, i) => ratedPlace(`Sight ${i}`, 4.3 + (i % 4) / 10, 2_000 + i));

const results = (over: RatedResults = {}): RatedResults => ({
  hotel: [ratedPlace("Lake Hotel", 4.6, 2_000, { type: "hotel" })],
  attraction: sights(),
  restaurant: mixedRestaurants(),
  nightlife: [bar("Luxury Club", "luxury", 4.8), bar("Smart Lounge", "upscale", 4.6), bar("Local Pub", "budget", 4.2)],
  ...over,
});

const plan: CityPlan = {
  destination: "India",
  cities: [
    { name: "Jaipur", days: 4, reason: "t" },
    { name: "Udaipur", days: 4, reason: "t" },
  ],
  source: "ai",
  plannerVersion: "test",
  fallbackReason: null,
};

/** The trip from the bug report: 4 people, 17 to 24 November, Jaipur then Udaipur. */
const draft = (over: Partial<TripDraftInput> = {}): TripDraftInput => ({
  destination: "India",
  startDate: "2026-11-17",
  endDate: "2026-11-24",
  budget: 100_000,
  currency: "INR",
  travelers: 4,
  travelerType: "friends",
  preferences: [],
  ...over,
});

const build = (over: Partial<TripDraftInput> = {}, res: RatedResults = results()) =>
  generateItinerary(draft(over), plan, undefined, new RatedPlacesProvider(res));

const activitiesOf = (itinerary: Awaited<ReturnType<typeof build>>, category: Activity["category"]) =>
  itinerary.days.flatMap((d) => d.activities).filter((a) => a.category === category);

const meals = (itinerary: Awaited<ReturnType<typeof build>>) => activitiesOf(itinerary, "food");

describe("meals follow the budget", () => {
  it("chooses only cheap restaurants on a budget that can't stretch further, when there are enough of them", async () => {
    const itinerary = await build({ budget: 100_000 });
    expect(meals(itinerary).length).toBeGreaterThan(10);
    for (const meal of meals(itinerary)) expect(meal.estimatedCost, meal.name).toBe(india.budget);
  });

  it("brings food for the reported trip down from over ₹2 lakh to well under ₹1,000 a person a day", async () => {
    const itinerary = await build({ budget: 100_000 });
    const perPersonPerDay = itinerary.budget.categories.food / (4 * itinerary.dayCount);
    expect(perPersonPerDay).toBeLessThanOrEqual(3 * india.budget);
    expect(itinerary.budget.categories.food).toBeLessThan(25_000);
  });

  it("chooses dearer restaurants as the budget grows, and never cheaper ones", async () => {
    const levels = [];
    for (const budget of [100_000, 250_000, 400_000, 700_000, 2_000_000]) {
      const itinerary = await build({ budget });
      levels.push(Math.max(...meals(itinerary).map((m) => m.estimatedCost)));
    }
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(levels[0]).toBe(india.budget);
    expect(levels.at(-1)).toBe(india.luxury);
  });

  it("chooses the best-rated restaurants within the spending level, not the cheapest", async () => {
    const res = results({
      restaurant: [
        ...Array.from({ length: 6 }, (_, i) => restaurant(`Good Cheap ${i}`, "budget", 4.7, 4_000)),
        ...Array.from({ length: 6 }, (_, i) => restaurant(`Poor Cheap ${i}`, "budget", 3.6, 4_000)),
      ],
    });
    const itinerary = await build({ budget: 100_000 }, res);
    // The best are used first: the first day eats only at them.
    const firstDay = itinerary.days[0].activities.filter((a) => a.category === "food");
    expect(firstDay.length).toBeGreaterThan(0);
    expect(firstDay.every((m) => m.name.startsWith("Good Cheap"))).toBe(true);
  });

  it("tops up with the cheapest of the rest when too few places are within the level, never the dearest", async () => {
    const res = results({
      restaurant: [
        restaurant("Cheap A", "budget"),
        restaurant("Cheap B", "budget"),
        ...Array.from({ length: 6 }, (_, i) => restaurant(`Mid ${i}`, "mid", 4.5)),
        ...Array.from({ length: 6 }, (_, i) => restaurant(`Luxury ${i}`, "luxury", 4.9)),
      ],
    });
    const itinerary = await build({ budget: 100_000 }, res);
    const names = new Set(meals(itinerary).map((m) => m.name));
    expect(names.has("Cheap A")).toBe(true);
    expect(names.has("Cheap B")).toBe(true);
    expect([...names].some((n) => n.startsWith("Luxury"))).toBe(false);
    expect(meals(itinerary).every((m) => m.estimatedCost <= india.mid)).toBe(true);
  });

  it("gives more people on the same budget cheaper meals", async () => {
    const two = await build({ travelers: 2, budget: 300_000 });
    const ten = await build({ travelers: 10, budget: 300_000 });
    const average = (it: Awaited<ReturnType<typeof build>>) =>
      meals(it).reduce((sum, m) => sum + m.estimatedCost, 0) / meals(it).length;
    expect(average(ten)).toBeLessThan(average(two));
  });

  it("chooses the same places for the same money in another currency", async () => {
    // The very same places (positions included), priced in dollars as the provider would.
    const base = results();
    const inDollars = (p: Place) => ({ ...p, ...priced(fromInr(p.price!.amount, "USD"), "USD") });
    const dollars = { ...base, restaurant: base.restaurant!.map(inDollars), nightlife: base.nightlife!.map(inDollars) };
    // Away from a tier's edge: right on one, the rounding of dollar prices to
    // whole dollars can tip the choice either way, as it would for rupees.
    for (const budgetInr of [100_000, 2_000_000]) {
      const inr = await build({ budget: budgetInr }, base);
      const usd = await build({ budget: fromInr(budgetInr, "USD"), currency: "USD" }, dollars);
      const names = (it: Awaited<ReturnType<typeof build>>) => [...meals(it), ...activitiesOf(it, "nightlife")].map((a) => a.name);
      expect(names(usd), `₹${budgetInr}`).toEqual(names(inr));
    }
  });

  it("keeps the estimate within a budget that can cover the trip", async () => {
    for (const budget of [250_000, 400_000, 700_000, 2_000_000]) {
      const itinerary = await build({ budget });
      expect(itinerary.budget.estimatedTotal, `₹${budget}`).toBeLessThanOrEqual(budget);
    }
  });

  it("still gives every day its dinner on a budget that is already spent", async () => {
    const itinerary = await build({ budget: 5_000 });
    for (const day of itinerary.days) expect(day.activities.some((a) => a.category === "food" && a.time === "20:00")).toBe(true);
    for (const meal of meals(itinerary)) expect(meal.estimatedCost).toBe(india.budget);
  });
});

describe("nights out follow the budget", () => {
  it("leaves them out when the budget has no room", async () => {
    expect(activitiesOf(await build({ budget: 100_000 }), "nightlife")).toEqual([]);
  });

  it("chooses a cheap one when there is a little room, and the dear ones only when there is plenty", async () => {
    const some = activitiesOf(await build({ budget: 250_000 }), "nightlife");
    expect(some.length).toBeGreaterThan(0);
    expect(some.every((a) => a.name === "Local Pub")).toBe(true);
    const plenty = activitiesOf(await build({ budget: 3_000_000 }), "nightlife");
    expect(plenty.some((a) => a.name === "Luxury Club")).toBe(true);
  });
});

describe("sights follow the budget, gently", () => {
  const withDearSight = () =>
    results({
      attraction: [ratedPlace("Theme Park", 4.9, 50_000, { category: "adventure", ...priced(india.upscale) }), ...sights()],
    });

  it("passes over a dear sight while there are enough others for the days", async () => {
    const itinerary = await build({ budget: 100_000 }, withDearSight());
    expect(itinerary.days.flatMap((d) => d.activities).some((a) => a.name === "Theme Park")).toBe(false);
  });

  it("includes it when the budget allows", async () => {
    const itinerary = await build({ budget: 2_000_000 }, withDearSight());
    expect(itinerary.days.flatMap((d) => d.activities).some((a) => a.name === "Theme Park")).toBe(true);
  });
});

describe("affordableRestaurants", () => {
  const at = (name: string, amount: number | null) =>
    ratedPlace(name, 4.5, 100, { type: "restaurant", category: "food", ...(amount === null ? {} : priced(amount)) });

  it("keeps the order it is given (best first) and only places within the limit, when there are enough", () => {
    const list = [at("A", 900), at("B", 100), at("C", 200), at("D", 300), at("E", 100), at("F", 50), at("G", 250)];
    expect(affordableRestaurants(list, 300).map((p) => p.name)).toEqual(["B", "C", "D", "E", "F", "G"]);
  });

  it("counts a place exactly at the limit as within it", () => {
    const list = Array.from({ length: MIN_MEAL_CHOICES }, (_, i) => at(`P${i}`, 300));
    expect(affordableRestaurants(list, 300)).toHaveLength(MIN_MEAL_CHOICES);
  });

  it("tops up to the minimum with the cheapest others, the better one first among equals", () => {
    const list = [at("Dear", 5_000), at("Mid1", 700), at("Ok", 100), at("Mid2", 700), at("Dearer", 9_000), at("Mid3", 650), at("Mid4", 700), at("Mid5", 700)];
    expect(affordableRestaurants(list, 300).map((p) => p.name)).toEqual(["Ok", "Mid3", "Mid1", "Mid2", "Mid4", "Mid5"]);
  });

  it("returns everything there is when there are fewer than the minimum", () => {
    const list = [at("Dear", 5_000), at("Ok", 100)];
    expect(affordableRestaurants(list, 300).map((p) => p.name)).toEqual(["Ok", "Dear"]);
    expect(affordableRestaurants([], 300)).toEqual([]);
  });

  it("can't judge a place with no price, so counts it as within the limit", () => {
    expect(affordableRestaurants([at("Unknown", null)], 0).map((p) => p.name)).toEqual(["Unknown"]);
  });
});

describe("affordableNightlife and sightsWithinSpending", () => {
  const at = (name: string, amount: number) => ratedPlace(name, 4.5, 100, priced(amount));

  it("keeps nights out within the limit only, and none without room for one", () => {
    const list = [at("Club", 3_000), at("Pub", 200), at("Bar", 600)];
    expect(affordableNightlife(list, 600).map((p) => p.name)).toEqual(["Pub", "Bar"]);
    expect(affordableNightlife(list, 100)).toEqual([]);
    expect(affordableNightlife(list, null)).toEqual([]);
  });

  it("counts a sight exactly at the limit as within it", () => {
    expect(sightsWithinSpending([at("Dear", 900), at("Edge", 500)], 500).map((p) => p.name)).toEqual(["Edge", "Dear"]);
  });

  it("puts dear sights after the rest, each group in its own order, dropping none", () => {
    const list = [at("Park", 3_000), at("Fort", 0), at("Zoo", 2_000), at("Lake", 0)];
    expect(sightsWithinSpending(list, 500).map((p) => p.name)).toEqual(["Fort", "Lake", "Park", "Zoo"]);
  });
});

describe("spendingMoneyPerPersonPerDayInr", () => {
  const city = (id: string, dayCount: number, pricePerNight: number, nights: number): City => ({
    id,
    name: id,
    country: "India",
    order: 0,
    startDate: "2026-11-17",
    endDate: "2026-11-20",
    dayCount,
    hotel: { name: "H", pricePerNight, currency: "INR", nights, referenceUrl: null, isDemoData: false },
    imageQuery: id,
  });
  const places = {} as CityPlaces;
  const meal = (cost: number): Activity =>
    ({ id: "m", name: "Meal", category: "food", time: "13:00", durationMinutes: 60, description: "", estimatedCost: cost, currency: "INR", referenceUrl: null, isDemoData: false }) as Activity;
  const day = (activities: Activity[]): TripDay => ({ id: "d", dayNumber: 1, date: "2026-11-17", cityId: "c", activities });
  const input = { budget: 100_000, currency: "INR", travelers: 2 };

  it("is what the budget leaves after flights, hotels and local transport, per person per day", () => {
    const stops: PlannedStop[] = [{ city: city("A", 4, 3_000, 3), places, previousDays: [], reusableDays: 0, transfer: null }];
    const expected = (spendableSubtotal(100_000, "INR") - 20_000 - 3_000 * 3 * 1 - DAILY_TRANSPORT_INR * 4) / (2 * 4);
    expect(spendingMoneyPerPersonPerDayInr(input, stops, 4, 20_000)).toBeCloseTo(expected, 0);
  });

  it("books a room for every two people", () => {
    const stops: PlannedStop[] = [{ city: city("A", 4, 3_000, 3), places, previousDays: [], reusableDays: 0, transfer: null }];
    const three = spendingMoneyPerPersonPerDayInr({ ...input, travelers: 3 }, stops, 4, 0)!;
    const expected = (spendableSubtotal(100_000, "INR") - 3_000 * 3 * 2 - DAILY_TRANSPORT_INR * 4) / (3 * 4);
    expect(three).toBeCloseTo(expected, 0);
  });

  it("takes off a transfer only when its city's first day is being built", () => {
    const transfer = { minutes: 300, distanceKm: 400, mode: "car" } as PlannedStop["transfer"];
    const fresh: PlannedStop[] = [{ city: city("A", 4, 0, 4), places, previousDays: [], reusableDays: 0, transfer }];
    const none: PlannedStop[] = [{ city: city("A", 4, 0, 4), places, previousDays: [], reusableDays: 0, transfer: null }];
    const carCost = 400 * 25; // one car for the party, ₹25 a km
    expect(spendingMoneyPerPersonPerDayInr(input, none, 4, 0)! - spendingMoneyPerPersonPerDayInr(input, fresh, 4, 0)!).toBeCloseTo(
      carCost / (2 * 4),
      6,
    );
  });

  it("counts what kept days already cost, and spreads the rest over the new days only", () => {
    const kept = [day([meal(1_000)]), day([meal(500)])];
    const stops: PlannedStop[] = [{ city: city("A", 4, 0, 4), places, previousDays: kept, reusableDays: 2, transfer: { minutes: 1, distanceKm: 10, mode: "car" } as PlannedStop["transfer"] }];
    const spentOnKept = activityCost(meal(1_000), 2) + activityCost(meal(500), 2);
    const expected = (spendableSubtotal(100_000, "INR") - spentOnKept - DAILY_TRANSPORT_INR * 4) / (2 * 2);
    expect(spendingMoneyPerPersonPerDayInr(input, stops, 4, 0)).toBeCloseTo(expected, 0);
  });

  it("is null with no budget, or with no new day to build", () => {
    const stops: PlannedStop[] = [{ city: city("A", 4, 3_000, 3), places, previousDays: [], reusableDays: 0, transfer: null }];
    expect(spendingMoneyPerPersonPerDayInr({ ...input, budget: 0 }, stops, 4, 0)).toBeNull();
    const allKept: PlannedStop[] = [{ city: city("A", 2, 3_000, 1), places: null, previousDays: [day([]), day([])], reusableDays: 2, transfer: null }];
    expect(spendingMoneyPerPersonPerDayInr(input, allKept, 2, 0)).toBeNull();
  });

  it("goes below zero when the fixed costs alone are more than the budget", () => {
    const stops: PlannedStop[] = [{ city: city("A", 4, 30_000, 3), places, previousDays: [], reusableDays: 0, transfer: null }];
    expect(spendingMoneyPerPersonPerDayInr(input, stops, 4, 50_000)!).toBeLessThan(0);
  });

  it("converts a foreign-currency budget to rupees", () => {
    const stops: PlannedStop[] = [{ city: city("A", 4, 0, 3), places, previousDays: [], reusableDays: 0, transfer: null }];
    const usd = spendingMoneyPerPersonPerDayInr({ budget: 1_205, currency: "USD", travelers: 2 }, stops, 4, 0)!;
    const inr = spendingMoneyPerPersonPerDayInr({ budget: 100_000, currency: "INR", travelers: 2 }, stops, 4, 0)!;
    expect(Math.abs(usd - inr) / inr).toBeLessThan(0.01);
  });
});
