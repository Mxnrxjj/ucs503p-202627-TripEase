import type { City } from "@/types/itinerary";

/**
 * How many nights the traveller sleeps in a city they spend `days` days in.
 *
 * You sleep a night in every city you stay in, except that the trip ends on its
 * last day. So the city the trip ends in gets one night fewer than its days,
 * which is none when the trip ends the day it arrives there.
 */
export function nightsInCity(days: number, endsTrip: boolean): number {
  return endsTrip ? Math.max(0, days - 1) : days;
}

/**
 * The most nights a hotel in this city can be booked for: what the city's own
 * days allow. The city the trip ends in has one fewer, since the last night of
 * the trip is the one before its last day.
 */
export function maxNightsOf(city: Pick<City, "id" | "dayCount">, cities: Pick<City, "id" | "order">[]): number {
  const last = cities.reduce<Pick<City, "id" | "order"> | null>((end, c) => (!end || c.order > end.order ? c : end), null);
  return nightsInCity(city.dayCount, last?.id === city.id);
}
