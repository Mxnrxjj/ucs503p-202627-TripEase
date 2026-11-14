import { describe, expect, it } from "vitest";
import { fromInr } from "@/lib/fx";
import { hotelRate } from "@/lib/hotels/rates";
import { quoteFlights } from "@/lib/flights/quote";
import {
  budgetVerdict,
  checkDraftBudget,
  checkTripBudget,
  minimumForTrip,
  minimumTrip,
  roundingStep,
  type CheckableTrip,
} from "@/lib/services/budget-check";
import { budgetCovering, computeBudgetBreakdown, DAILY_TRANSPORT_INR } from "@/lib/services/budget-engine";
import { dailyFoodInr, spendPricesFor } from "@/lib/spending/prices";
import type { Activity, City } from "@/types/itinerary";
import type { TripDraftInput } from "@/types/trip";

const jaipur3Star = hotelRate({ city: "Jaipur", destination: "India", maxPerNightInr: null, tier: "budget" }).perNightInr;
const udaipur3Star = hotelRate({ city: "Udaipur", destination: "India", maxPerNightInr: null, tier: "budget" }).perNightInr;
const indiaBudgetDay = dailyFoodInr("budget", spendPricesFor("IN"));

describe("minimumTrip", () => {
  const base = {
    destination: "India",
    cities: [
      { name: "Jaipur", nights: 4 },
      { name: "Udaipur", nights: 3 },
    ],
    dayCount: 8,
    travelers: 4,
    currency: "INR",
    flightsInr: 29_960,
    transfersInr: 10_478,
  };

  it("adds flights, 3-star rooms for two, three cheap meals a day each, and transport", () => {
    const min = minimumTrip(base);
    expect(min.parts).toEqual({
      flights: 29_960,
      hotels: (jaipur3Star * 4 + udaipur3Star * 3) * 2,
      food: indiaBudgetDay * 4 * 8,
      transport: 10_478 + DAILY_TRANSPORT_INR * 8,
    });
    const subtotal = Object.values(min.parts).reduce((a, b) => a + b, 0);
    expect(min.budget).toBe(Math.ceil(budgetCovering(subtotal, "INR") / 1_000) * 1_000);
  });

  it("rounds up, never down, to the next ₹1,000", () => {
    // Several group sizes, so some exact figures fall in the lower half of a thousand.
    let lowerHalf = 0;
    for (const travelers of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const min = minimumTrip({ ...base, travelers });
      const exact = budgetCovering(Object.values(min.parts).reduce((a, b) => a + b, 0), "INR");
      expect(min.budget % 1_000).toBe(0);
      expect(min.budget).toBeGreaterThanOrEqual(exact);
      expect(min.budget - exact).toBeLessThan(1_000);
      if (exact % 1_000 > 0 && exact % 1_000 < 500) lowerHalf += 1;
    }
    expect(lowerHalf).toBeGreaterThan(0);
  });

  it("is a budget the engine would call enough for that cheapest trip", () => {
    const min = minimumTrip(base);
    const subtotal = Object.values(min.parts).reduce((a, b) => a + b, 0);
    const estimate = computeBudgetBreakdown({ cities: [], days: [], travelers: 1, currency: "INR", userBudget: min.budget, flightCostTotal: subtotal });
    expect(estimate.estimatedTotal).toBeLessThanOrEqual(min.budget);
  });

  it("puts the reported ₹1,00,000 Jaipur and Udaipur trip below the minimum", () => {
    expect(minimumTrip(base).budget).toBeGreaterThan(100_000);
  });

  it("needs no hotel for a city with no nights, and never a negative one", () => {
    const min = minimumTrip({ ...base, cities: [{ name: "Jaipur", nights: 0 }, { name: "Udaipur", nights: -2 }] });
    expect(min.parts.hotels).toBe(0);
  });

  it("books a room per two people, rounding up", () => {
    const one = minimumTrip({ ...base, travelers: 1 }).parts.hotels;
    expect(minimumTrip({ ...base, travelers: 2 }).parts.hotels).toBe(one);
    expect(minimumTrip({ ...base, travelers: 3 }).parts.hotels).toBe(one * 2);
  });

  it("treats a missing or odd traveller count as one, and a day count below one as one day", () => {
    expect(minimumTrip({ ...base, travelers: 0 }).parts.food).toBe(indiaBudgetDay * 8);
    expect(minimumTrip({ ...base, dayCount: 0 }).parts.food).toBe(indiaBudgetDay * 4);
  });

  it("ignores negative flight or transfer figures", () => {
    const min = minimumTrip({ ...base, flightsInr: -5, transfersInr: -5 });
    expect(min.parts.flights).toBe(0);
    expect(min.parts.transport).toBe(DAILY_TRANSPORT_INR * 8);
  });

  it("works in the trip's currency and rounds up to 10 of it", () => {
    const usd = minimumTrip({ ...base, currency: "USD" });
    expect(usd.currency).toBe("USD");
    expect(usd.parts.flights).toBe(fromInr(29_960, "USD"));
    expect(usd.budget % 10).toBe(0);
    expect(roundingStep("USD")).toBe(10);
    expect(roundingStep("INR")).toBe(1_000);
  });

  it("costs far more for the same trip in Switzerland", () => {
    const swiss = minimumTrip({ ...base, destination: "Switzerland", cities: [{ name: "Zurich", nights: 7 }] });
    expect(swiss.parts.food).toBeGreaterThan(minimumTrip(base).parts.food * 10);
  });
});

describe("budgetVerdict", () => {
  it("fits whenever the plan is within the budget, however small the budget", () => {
    expect(budgetVerdict({ total: 10_000, estimatedTotal: 10_000 }, 50_000)).toBe("fits");
    expect(budgetVerdict({ total: 10_000, estimatedTotal: 9_000 }, 50_000)).toBe("fits");
  });

  it("is over when the plan is over but the budget could cover the cheapest version", () => {
    expect(budgetVerdict({ total: 50_000, estimatedTotal: 60_000 }, 50_000)).toBe("over");
    expect(budgetVerdict({ total: 80_000, estimatedTotal: 90_000 }, 50_000)).toBe("over");
  });

  it("is unrealistic when the plan is over and the budget is below the cheapest version", () => {
    expect(budgetVerdict({ total: 49_999, estimatedTotal: 60_000 }, 50_000)).toBe("unrealistic");
  });
});

describe("checkTripBudget", () => {
  const city = (name: string, nights: number): Pick<City, "name" | "hotel"> => ({
    name,
    hotel: { name: "H", pricePerNight: 3_000, currency: "INR", nights, referenceUrl: null, isDemoData: false },
  });
  const transfer = { category: "transport", estimatedCost: 10_478 } as Activity;
  const meal = { category: "food", estimatedCost: 5_000 } as Activity;
  const trip = (over: Partial<CheckableTrip> = {}): CheckableTrip => ({
    destination: "India",
    cities: [city("Jaipur", 4), city("Udaipur", 3)],
    days: [{ activities: [meal] }, { activities: [transfer, meal] }],
    dayCount: 8,
    travelers: 4,
    currency: "INR",
    budget: { currency: "INR", total: 100_000, estimatedTotal: 394_530, categories: { flights: 29_960 } as CheckableTrip["budget"]["categories"] },
    flights: { totalInr: 29_960 },
    ...over,
  });

  it("calls the reported trip unrealistic, with its own nights, flights and transfers", () => {
    const check = checkTripBudget(trip());
    expect(check.verdict).toBe("unrealistic");
    expect(check.minimum.parts.flights).toBe(29_960);
    expect(check.minimum.parts.transport).toBe(10_478 + DAILY_TRANSPORT_INR * 8);
    expect(check.minimum.parts.hotels).toBe((jaipur3Star * 4 + udaipur3Star * 3) * 2);
  });

  it("uses no flights when they were left out, and the budget's flight figure on a trip saved before quotes", () => {
    expect(minimumForTrip(trip({ flights: null })).parts.flights).toBe(0);
    expect(minimumForTrip(trip({ flights: undefined })).parts.flights).toBe(29_960);
  });

  it("calls it over, not unrealistic, once the budget covers the cheapest version", () => {
    const minimum = minimumForTrip(trip()).budget;
    const check = checkTripBudget(trip({ budget: { ...trip().budget, total: minimum } }));
    expect(check.verdict).toBe("over");
  });

  it("converts a dollar trip's transfers to rupees before pricing", () => {
    const usd = trip({
      currency: "USD",
      days: [{ activities: [{ category: "transport", estimatedCost: 126 } as Activity] }],
      budget: { ...trip().budget, currency: "USD" },
    });
    expect(minimumForTrip(usd).parts.transport).toBe(fromInr(126 * 83 + DAILY_TRANSPORT_INR * 8, "USD"));
  });
});

describe("checkDraftBudget", () => {
  const draft = (over: Partial<TripDraftInput> = {}): TripDraftInput => ({
    destination: "India",
    startDate: "2027-01-10",
    endDate: "2027-01-17",
    budget: 100_000,
    currency: "INR",
    travelers: 4,
    travelerType: "friends",
    preferences: [],
    origin: "DEL",
    includeFlights: true,
    ...over,
  });
  const now = new Date("2026-11-15T12:00:00Z");

  it("flags 5,000 for ten days in Japan", () => {
    const check = checkDraftBudget(draft({ destination: "Japan", budget: 5_000, travelers: 1, endDate: "2027-01-19" }), now)!;
    expect(check.tooLow).toBe(true);
    expect(check.minimum.budget).toBeGreaterThan(50_000);
  });

  it("does not flag a budget exactly at the minimum, and flags one unit less", () => {
    const minimum = checkDraftBudget(draft(), now)!.minimum.budget;
    expect(checkDraftBudget(draft({ budget: minimum }), now)!.tooLow).toBe(false);
    expect(checkDraftBudget(draft({ budget: minimum - 1 }), now)!.tooLow).toBe(true);
  });

  it("does not flag a comfortable budget", () => {
    expect(checkDraftBudget(draft({ budget: 1_000_000 }), now)!.tooLow).toBe(false);
  });

  it("counts flights from the chosen airport, and none when they are left out", () => {
    const withFlights = checkDraftBudget(draft(), now)!.minimum;
    const flights = quoteFlights({ origin: "DEL", destination: "India", firstCity: "Delhi", startDate: "2027-01-10", travelers: 4, now })!;
    expect(withFlights.parts.flights).toBe(flights.totalInr);
    expect(checkDraftBudget(draft({ includeFlights: false }), now)!.minimum.parts.flights).toBe(0);
  });

  it("plans around a named place, as the planner would", () => {
    const goa = checkDraftBudget(draft({ focus: "Goa" }), now)!.minimum;
    const country = checkDraftBudget(draft(), now)!.minimum;
    expect(goa.parts.hotels).not.toBe(country.parts.hotels);
  });

  it("can't check before there is a budget or real dates", () => {
    expect(checkDraftBudget(draft({ budget: 0 }), now)).toBeNull();
    expect(checkDraftBudget(draft({ budget: Number.NaN }), now)).toBeNull();
    expect(checkDraftBudget(draft({ startDate: "", endDate: "" }), now)).toBeNull();
    expect(checkDraftBudget(draft({ startDate: "2027-01-17", endDate: "2027-01-10" }), now)).toBeNull();
    expect(checkDraftBudget(draft({ destination: "" }), now)).toBeNull();
    expect(checkDraftBudget(draft({ destination: "Atlantis" }), now)).toBeNull();
  });

  it("leaves out transfers, which need the cities' positions, so it can only understate", () => {
    const check = checkDraftBudget(draft(), now)!;
    expect(check.minimum.parts.transport).toBe(DAILY_TRANSPORT_INR * 8);
  });
});
