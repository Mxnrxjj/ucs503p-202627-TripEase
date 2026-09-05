import { computeBudgetBreakdown } from "@/lib/services/budget-engine";
import type { City, TripDay } from "@/types/itinerary";
import type { Trip } from "@/types/trip";
import type { SavingsSuggestion } from "@/types/budget";

/**
 * Pure functions that take a trip and an edit and return the new
 * `days`/`cities`/`budget` for it — no Firestore, no React. The roadmap page
 * calls one of these, then persists the result with
 * `updateTripItinerary`, which is what keeps the budget numbers in lockstep
 * with every itinerary edit.
 */

function recomputeBudget(trip: Trip, cities: City[], days: TripDay[]) {
  const flightCostTotal = trip.budget.categories.flights;
  return computeBudgetBreakdown({
    cities,
    days,
    travelers: trip.travelers,
    currency: trip.currency,
    userBudget: trip.budget.total,
    flightCostTotal,
  });
}

export function withUpdatedDay(trip: Trip, dayId: string, updater: (day: TripDay) => TripDay) {
  const days = trip.days.map((d) => (d.id === dayId ? updater(d) : d));
  return { days, budget: recomputeBudget(trip, trip.cities, days) };
}

export function addActivity(trip: Trip, dayId: string, activity: TripDay["activities"][number]) {
  return withUpdatedDay(trip, dayId, (day) => ({ ...day, activities: [...day.activities, activity] }));
}

export function updateActivity(
  trip: Trip,
  dayId: string,
  activityId: string,
  patch: Partial<TripDay["activities"][number]>,
) {
  return withUpdatedDay(trip, dayId, (day) => ({
    ...day,
    activities: day.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
  }));
}

export function deleteActivity(trip: Trip, dayId: string, activityId: string) {
  return withUpdatedDay(trip, dayId, (day) => ({
    ...day,
    activities: day.activities.filter((a) => a.id !== activityId),
  }));
}

export function reorderActivities(trip: Trip, dayId: string, orderedIds: string[]) {
  return withUpdatedDay(trip, dayId, (day) => {
    const byId = new Map(day.activities.map((a) => [a.id, a]));
    return { ...day, activities: orderedIds.map((id) => byId.get(id)!).filter(Boolean) };
  });
}

export function updateHotel(trip: Trip, cityId: string, patch: Partial<City["hotel"]>) {
  const cities = trip.cities.map((c) => (c.id === cityId ? { ...c, hotel: { ...c.hotel, ...patch } } : c));
  return { cities, budget: recomputeBudget(trip, cities, trip.days) };
}

/** Apply one deterministic savings suggestion from the budget alert panel. */
export function applySuggestion(trip: Trip, suggestion: SavingsSuggestion) {
  switch (suggestion.kind) {
    case "hotel-downgrade": {
      const city = trip.cities.find((c) => c.id === suggestion.targetId);
      if (!city) return null;
      return updateHotel(trip, city.id, {
        name: city.hotel.name.replace(/\(demo\)/i, "").trim() + " — budget option (demo)",
        pricePerNight: Math.round(city.hotel.pricePerNight * 0.7),
        isDemoData: true,
        referenceUrl: null,
        rating: null,
        imageUrl: null,
        source: null,
        priceIsEstimate: true,
      });
    }
    case "activity-swap": {
      const day = trip.days.find((d) => d.activities.some((a) => a.id === suggestion.targetId));
      if (!day) return null;
      const activity = day.activities.find((a) => a.id === suggestion.targetId)!;
      return updateActivity(trip, day.id, activity.id, {
        name: `${activity.name} (shared group tour)`,
        estimatedCost: Math.round(activity.estimatedCost * 0.4),
        isDemoData: true,
        referenceUrl: null,
        rating: null,
        imageUrl: null,
        source: null,
        priceIsEstimate: true,
      });
    }
    case "food-swap": {
      const days = trip.days.map((day) => ({
        ...day,
        activities: day.activities.map((a) =>
          a.category === "food" ? { ...a, estimatedCost: Math.round(a.estimatedCost * 0.85) } : a,
        ),
      }));
      return { days, budget: recomputeBudget(trip, trip.cities, days) };
    }
    default:
      return null;
  }
}
