import type { BudgetBreakdown, BudgetCategory, SavingsSuggestion } from "@/types/budget";
import type { Activity, ActivityCategory, City, Hotel, TripDay } from "@/types/itinerary";
import { fromInr } from "@/lib/fx";

/**
 * Pure functions that turn an itinerary (cities + days + activities) into a
 * budget breakdown, and — when the estimate exceeds the traveller's stated
 * budget — into a short list of deterministic ways to close the gap.
 * Nothing here touches Firestore or React; the roadmap and budget UI call
 * these after every edit so the numbers stay in lockstep with the itinerary.
 */

// These three numbers are written in rupees and converted to the trip's currency
// when they are used, so a USD, EUR or GBP trip gets sensible values too.
const DAILY_TRANSPORT_INR = 500;
const MIN_BUFFER_INR = 3_000;
const PRICEY_ACTIVITY_INR = 1_500;

// A shared tour is something you buy for a sight or an activity. It makes no
// sense for a meal, a transfer between cities, a night out or a shopping stop.
const SHARED_TOUR_CATEGORIES: ActivityCategory[] = ["sightseeing", "culture", "adventure", "beach", "relaxation"];

const ACTIVITY_CATEGORY_TO_BUDGET: Record<string, BudgetCategory> = {
  food: "food",
  shopping: "shopping",
  transport: "transport",
  sightseeing: "activities",
  adventure: "activities",
  beach: "activities",
  culture: "activities",
  relaxation: "activities",
  nightlife: "activities",
};

/** How many people share one hotel room. */
export const PEOPLE_PER_ROOM = 2;

/** The budget buckets whose prices are per person (a meal, an entry ticket), so they are paid once per traveller. */
const PER_PERSON_BUCKETS: ReadonlySet<BudgetCategory> = new Set(["food", "activities"]);

/**
 * The traveller count as a whole number of at least 1. A saved trip should
 * always have one, but a missing or odd value must not turn every cost into 0
 * or NaN.
 */
export function partySize(travelers: number): number {
  return Number.isFinite(travelers) && travelers >= 1 ? Math.floor(travelers) : 1;
}

/** Rooms needed for the party: two people to a room, rounding up (3 people need 2 rooms). */
export function roomsFor(travelers: number): number {
  return Math.ceil(partySize(travelers) / PEOPLE_PER_ROOM);
}

/** What a hotel costs the whole party: the nightly room price, for every room, for every night. */
export function hotelCost(hotel: Pick<Hotel, "pricePerNight" | "nights">, travelers: number): number {
  return hotel.pricePerNight * hotel.nights * roomsFor(travelers);
}

/** The budget bucket an activity's cost goes in. */
export function budgetCategoryOf(activity: Pick<Activity, "category">): BudgetCategory {
  return ACTIVITY_CATEGORY_TO_BUDGET[activity.category] ?? "misc";
}

/**
 * Whether an activity's price is per person. Meals and sights are. A transfer
 * between cities is already priced for the whole party when it is made, and
 * local transport, shopping and anything uncategorised are taken as one cost
 * for the group.
 */
export function isPricedPerPerson(activity: Pick<Activity, "category">): boolean {
  return PER_PERSON_BUCKETS.has(budgetCategoryOf(activity));
}

/** What an activity costs the whole party. */
export function activityCost(activity: Pick<Activity, "category" | "estimatedCost">, travelers: number): number {
  return isPricedPerPerson(activity) ? activity.estimatedCost * partySize(travelers) : activity.estimatedCost;
}

export interface ComputeBudgetInput {
  cities: City[];
  days: TripDay[];
  travelers: number;
  currency: string;
  userBudget: number;
  flightCostTotal: number;
}

export function computeBudgetBreakdown(input: ComputeBudgetInput): BudgetBreakdown {
  const categories: Record<BudgetCategory, number> = {
    flights: Math.round(input.flightCostTotal),
    hotels: 0,
    food: 0,
    activities: 0,
    transport: 0,
    shopping: 0,
    misc: 0,
    buffer: 0,
  };

  // Hotel prices are per room and night, meal and sight prices per person:
  // both are multiplied up to the whole party here (see `hotelCost`, `activityCost`).
  for (const city of input.cities) {
    categories.hotels += hotelCost(city.hotel, input.travelers);
  }

  for (const day of input.days) {
    for (const activity of day.activities) {
      categories[budgetCategoryOf(activity)] += activityCost(activity, input.travelers);
    }
    // A small daily allowance for local transport (taxis, tuk-tuks, metro)
    // that isn't tied to any single itinerary line item.
    categories.transport += fromInr(DAILY_TRANSPORT_INR, input.currency);
  }

  const subtotal =
    categories.flights +
    categories.hotels +
    categories.food +
    categories.activities +
    categories.transport +
    categories.shopping;

  categories.misc = Math.round(subtotal * 0.04);
  categories.buffer = Math.round(Math.max(input.userBudget * 0.05, fromInr(MIN_BUFFER_INR, input.currency)));

  for (const key of Object.keys(categories) as BudgetCategory[]) {
    categories[key] = Math.round(categories[key]);
  }

  const estimatedTotal = Object.values(categories).reduce((a, b) => a + b, 0);

  return {
    currency: input.currency,
    total: Math.round(input.userBudget),
    estimatedTotal,
    categories,
  };
}

/**
 * Deterministic, explainable "ways to save" — no real recommendation model,
 * just a handful of rules over the itinerary that has already been built.
 * A suggestion is advice, with the words to ask Travis to act on it. It never
 * edits the trip itself: a cheaper hotel or tour has to be a real one, found by
 * the places provider and confirmed by the traveller.
 */
export function buildSavingsSuggestions(
  cities: City[],
  days: TripDay[],
  budget: BudgetBreakdown,
  travelers: number,
): SavingsSuggestion[] {
  const suggestions: SavingsSuggestion[] = [];
  const overBy = budget.estimatedTotal - budget.total;
  if (overBy <= 0) return suggestions;

  // A city with no nights has no hotel to save on.
  const priciestHotel = cities
    .filter((c) => c.hotel.nights > 0)
    .sort((a, b) => hotelCost(b.hotel, travelers) - hotelCost(a.hotel, travelers))[0];
  if (priciestHotel && priciestHotel.hotel.pricePerNight > 0) {
    const savings = Math.round(hotelCost(priciestHotel.hotel, travelers) * 0.3);
    suggestions.push({
      id: `hotel-${priciestHotel.id}`,
      kind: "hotel-downgrade",
      title: `Switch to a more modest hotel in ${priciestHotel.name}`,
      description: `Move from ${priciestHotel.hotel.name} to a cheaper, well-rated hotel for the same nights.`,
      estimatedSavings: savings,
      targetId: priciestHotel.id,
      askTravis: `Find me a cheaper, well-rated hotel in ${priciestHotel.name}`,
    });
  }

  const allActivities = days.flatMap((d) => d.activities.map((a) => ({ dayId: d.id, activity: a })));
  const nonEssential = allActivities
    .filter(
      ({ activity }) =>
        SHARED_TOUR_CATEGORIES.includes(activity.category) && activity.estimatedCost > fromInr(PRICEY_ACTIVITY_INR, budget.currency),
    )
    .sort((a, b) => b.activity.estimatedCost - a.activity.estimatedCost)[0];
  if (nonEssential) {
    // The price is per person; a shared tour saves on every ticket.
    const savings = Math.round(activityCost(nonEssential.activity, travelers) * 0.6);
    suggestions.push({
      id: `activity-${nonEssential.activity.id}`,
      kind: "activity-swap",
      title: `Use a shared tour instead of "${nonEssential.activity.name}"`,
      description: "A shared/group version of this activity instead of a private one.",
      estimatedSavings: savings,
      targetId: nonEssential.activity.id,
      askTravis: `Replace ${nonEssential.activity.name} with a cheaper, well-rated alternative`,
    });
  }

  if (budget.categories.food > 0) {
    suggestions.push({
      id: "food-local",
      kind: "food-swap",
      title: "Choose local restaurants over hotel dining",
      description: "Swap one hotel/rooftop meal per city for a local restaurant.",
      estimatedSavings: Math.round(budget.categories.food * 0.15),
      askTravis: "Replace hotel meals with well-rated local restaurants",
    });
  }

  return suggestions.slice(0, 3);
}
