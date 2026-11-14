import { resolveCountry } from "@/lib/countries";
import { quoteFlights } from "@/lib/flights/quote";
import { fromInr, toInr } from "@/lib/fx";
import { nightsInCity } from "@/lib/hotel-nights";
import { hotelRate } from "@/lib/hotels/rates";
import { activityCost, budgetCovering, DAILY_TRANSPORT_INR, partySize, roomsFor } from "@/lib/services/budget-engine";
import { planCitiesDeterministically } from "@/lib/services/planning/fallback-planner";
import { dailyFoodInr, spendPricesFor } from "@/lib/spending/prices";
import { cleanFocus } from "@/lib/trip-focus";
import { dayCountInclusive, parseDateInput } from "@/lib/date";
import type { BudgetBreakdown, BudgetNote } from "@/types/budget";
import type { City, TripDay } from "@/types/itinerary";
import type { FlightQuote } from "@/types/flights";
import type { TripDraftInput } from "@/types/trip";

/**
 * Is the traveller's budget one a trip like this can realistically be done on?
 *
 * A budget can be over the estimate for two different reasons. Usually the
 * plan has something dear in it that a cheaper choice would fix, and "ways to
 * save" says what. But sometimes the budget is below what even the cheapest
 * version of the trip costs (5,000 for ten days in Japan), and no swap fixes
 * that. This tells the two apart, by working out that cheapest version: the
 * flights as quoted, 3-star hotels (the cheapest class TripEase plans),
 * three meals a day at inexpensive local restaurants, the transfers and local
 * transport, and nothing else (sights can be free). Misc and the buffer are
 * added the way the budget engine adds them. The result is a floor, "at least",
 * never a quote.
 *
 * Deterministic on purpose: the verdict and every number shown with it come
 * from here. A model may phrase an explanation around them (see the generate
 * route), but never decides or invents them.
 */

export type BudgetVerdict = "fits" | "over" | "unrealistic";

/** The cheapest version of the trip, in the trip's currency. */
export interface MinimumTrip {
  currency: string;
  /** The smallest budget that covers it, misc and buffer included, rounded up to a round figure. */
  budget: number;
  /** What it is made of, before misc and the buffer. Whole units of the currency. */
  parts: { flights: number; hotels: number; food: number; transport: number };
}

export interface MinimumTripInput {
  destination: string;
  cities: { name: string; nights: number }[];
  dayCount: number;
  travelers: number;
  currency: string;
  /** The whole party's flights, in rupees; 0 when flights aren't part of the budget. */
  flightsInr: number;
  /** Transfers between the trip's cities, in rupees. */
  transfersInr: number;
}

/** The step a minimum budget is rounded up to: ₹1,000, or 10 of any other currency. */
export function roundingStep(currency: string): number {
  return currency === "INR" ? 1_000 : 10;
}

export function minimumTrip(input: MinimumTripInput): MinimumTrip {
  const people = partySize(input.travelers);
  const days = Math.max(1, Math.floor(input.dayCount));
  const prices = spendPricesFor(resolveCountry(input.destination)?.code ?? null);

  const hotelsInr = input.cities.reduce((sum, city) => {
    const nights = Math.max(0, city.nights);
    const rate = hotelRate({ city: city.name, destination: input.destination, maxPerNightInr: null, tier: "budget" });
    return sum + rate.perNightInr * nights * roomsFor(people);
  }, 0);
  const foodInr = dailyFoodInr("budget", prices) * people * days;
  const transportInr = Math.max(0, input.transfersInr) + DAILY_TRANSPORT_INR * days;
  const flightsInr = Math.max(0, input.flightsInr);

  const parts = {
    flights: fromInr(flightsInr, input.currency),
    hotels: fromInr(hotelsInr, input.currency),
    food: fromInr(foodInr, input.currency),
    transport: fromInr(transportInr, input.currency),
  };
  const subtotal = parts.flights + parts.hotels + parts.food + parts.transport;
  const step = roundingStep(input.currency);
  return { currency: input.currency, budget: Math.ceil(budgetCovering(subtotal, input.currency) / step) * step, parts };
}

/**
 * "unrealistic" only when the plan is over the budget AND the budget is below
 * the cheapest version of the trip: a plan someone has trimmed to fit is fine,
 * however small its budget. "over" when it is over but a cheaper plan could fit.
 */
export function budgetVerdict(budget: Pick<BudgetBreakdown, "total" | "estimatedTotal">, minimumBudget: number): BudgetVerdict {
  if (budget.estimatedTotal <= budget.total) return "fits";
  return budget.total < minimumBudget ? "unrealistic" : "over";
}

/** What a saved or freshly built trip needs to be checked. */
export interface CheckableTrip {
  destination: string;
  cities: Pick<City, "name" | "hotel">[];
  days: Pick<TripDay, "activities">[];
  dayCount: number;
  travelers: number;
  currency: string;
  budget: BudgetBreakdown;
  /** Null when flights were left out; absent on trips saved before quotes, whose flight cost is in the budget. */
  flights?: Pick<FlightQuote, "totalInr"> | null;
}

/** The cheapest version of a trip that has been built: its own cities, nights, flights and transfers. */
export function minimumForTrip(trip: CheckableTrip): MinimumTrip {
  const flightsInr =
    trip.flights === undefined ? toInr(trip.budget.categories.flights ?? 0, trip.currency) : (trip.flights?.totalInr ?? 0);
  // Every transport line in the plan is a journey it can't do without (the
  // transfers between cities, or one the traveller added).
  const transfers = trip.days
    .flatMap((day) => day.activities)
    .filter((activity) => activity.category === "transport")
    .reduce((sum, activity) => sum + activityCost(activity, trip.travelers), 0);
  return minimumTrip({
    destination: trip.destination,
    cities: trip.cities.map((city) => ({ name: city.name, nights: city.hotel.nights })),
    dayCount: trip.dayCount,
    travelers: trip.travelers,
    currency: trip.currency,
    flightsInr,
    transfersInr: toInr(transfers, trip.currency),
  });
}

export interface TripBudgetCheck {
  verdict: BudgetVerdict;
  minimum: MinimumTrip;
}

export function checkTripBudget(trip: CheckableTrip): TripBudgetCheck {
  const minimum = minimumForTrip(trip);
  return { verdict: budgetVerdict(trip.budget, minimum.budget), minimum };
}

/**
 * A rough check before a trip is built, from what the wizard knows: the cities
 * the rule-based planner would choose, flights from the chosen airport, and no
 * transfers (they need the cities' positions), so it can only understate.
 * Null when the destination, the dates or the budget can't be checked yet.
 */
export function checkDraftBudget(draft: TripDraftInput, now: Date = new Date()): { tooLow: boolean; minimum: MinimumTrip } | null {
  if (!(draft.budget > 0) || !resolveCountry(draft.destination)) return null;
  const dayCount = dayCountInclusive(parseDateInput(draft.startDate), parseDateInput(draft.endDate));
  if (!Number.isFinite(dayCount) || dayCount < 1) return null;

  const allocations = planCitiesDeterministically({
    destination: draft.destination,
    focus: cleanFocus(draft.focus, draft.destination),
    startDate: draft.startDate,
    endDate: draft.endDate,
    dayCount,
    travelers: draft.travelers,
    budget: draft.budget,
    currency: draft.currency,
    preferences: draft.preferences,
  });
  const cities = allocations.map((a, i) => ({ name: a.name, nights: nightsInCity(a.days, i === allocations.length - 1) }));
  const flights =
    draft.includeFlights === false
      ? null
      : quoteFlights({
          origin: draft.origin,
          destination: draft.destination,
          firstCity: cities[0]?.name,
          startDate: draft.startDate,
          travelers: draft.travelers,
          now,
        });

  const minimum = minimumTrip({
    destination: draft.destination,
    cities,
    dayCount,
    travelers: draft.travelers,
    currency: draft.currency,
    flightsInr: flights?.totalInr ?? 0,
    transfersInr: 0,
  });
  return { tooLow: draft.budget < minimum.budget, minimum };
}

/**
 * The saved budget note's text, when it still describes this trip: the trip is
 * still unrealistic for its budget, and the minimum and the budget are the
 * figures the note was written for. After an edit that changes either, the
 * note is stale and null is returned, so it can never contradict the numbers
 * shown beside it.
 */
export function currentBudgetNote(
  note: BudgetNote | null | undefined,
  check: TripBudgetCheck,
  budget: Pick<BudgetBreakdown, "total" | "currency">,
): string | null {
  if (!note || check.verdict !== "unrealistic") return null;
  const sameFigures =
    note.currency === budget.currency && note.budget === budget.total && note.minimumBudget === check.minimum.budget;
  return sameFigures ? note.text : null;
}
