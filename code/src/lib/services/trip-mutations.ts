import { computeBudgetBreakdown } from "@/lib/services/budget-engine";
import { retimeInOrder, sortByTime } from "@/lib/services/feasibility/schedule";
import type { City, TripDay } from "@/types/itinerary";
import type { Trip } from "@/types/trip";

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

/** The new activity goes where its time puts it, after any that share that time. */
export function addActivity(trip: Trip, dayId: string, activity: TripDay["activities"][number]) {
  return withUpdatedDay(trip, dayId, (day) => ({ ...day, activities: sortByTime([...day.activities, activity]) }));
}

export function updateActivity(
  trip: Trip,
  dayId: string,
  activityId: string,
  patch: Partial<TripDay["activities"][number]>,
) {
  return withUpdatedDay(trip, dayId, (day) => {
    const activities = day.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a));
    // Only a changed time can put the day out of order, so only then is it re-sorted.
    const before = day.activities.find((a) => a.id === activityId);
    const timeChanged = before !== undefined && patch.time !== undefined && patch.time !== before.time;
    return { ...day, activities: timeChanged ? sortByTime(activities) : activities };
  });
}

export function deleteActivity(trip: Trip, dayId: string, activityId: string) {
  return withUpdatedDay(trip, dayId, (day) => ({
    ...day,
    activities: day.activities.filter((a) => a.id !== activityId),
  }));
}

/**
 * Dragging stops into a new order moves the places, not the clock: the day's
 * start times are dealt out again in the new order (and nudged later where
 * the traveller couldn't get there in time), so the times still read in order.
 */
export function reorderActivities(trip: Trip, dayId: string, orderedIds: string[]) {
  return withUpdatedDay(trip, dayId, (day) => ({ ...day, activities: retimeInOrder(day.activities, orderedIds) }));
}

export function updateHotel(trip: Trip, cityId: string, patch: Partial<City["hotel"]>) {
  const cities = trip.cities.map((c) => (c.id === cityId ? { ...c, hotel: { ...c.hotel, ...patch } } : c));
  return { cities, budget: recomputeBudget(trip, cities, trip.days) };
}
