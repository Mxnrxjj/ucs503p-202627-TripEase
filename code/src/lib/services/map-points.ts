import type { ActivityCategory } from "@/types/itinerary";
import { verificationOf, type LatLng, type PlaceVerification } from "@/types/place";
import type { Trip } from "@/types/trip";

/**
 * Turns a saved trip into the flat list of mappable points the map renders.
 *
 * Pure and provider-agnostic: the map never knows whether a coordinate came
 * from Google or from curated demo content, only that it exists. Places
 * without a real coordinate are simply not mapped — we never place a pin at
 * a guessed position to make the map look fuller.
 */

export type MapFilterMode = "all" | "city" | "day";

export interface MapFilter {
  mode: MapFilterMode;
  cityId: string | null;
  dayId: string | null;
}

export interface MapPoint {
  /** Activity id, or `hotel:<cityId>` for a city's hotel. Also the selection key. */
  id: string;
  kind: "activity" | "hotel";
  name: string;
  location: LatLng;
  cityId: string;
  cityName: string;
  dayId: string | null;
  dayNumber: number | null;
  category: ActivityCategory | null;
  estimatedCost: number | null;
  currency: string;
  verification: PlaceVerification;
  /** 1-based position within its day, used for the marker label and route order. */
  order: number | null;
}

export function buildMapPoints(trip: Trip): MapPoint[] {
  const cityById = new Map(trip.cities.map((c) => [c.id, c]));
  const points: MapPoint[] = [];

  for (const city of trip.cities) {
    if (city.hotel.location) {
      points.push({
        id: `hotel:${city.id}`,
        kind: "hotel",
        name: city.hotel.name,
        location: city.hotel.location,
        cityId: city.id,
        cityName: city.name,
        dayId: null,
        dayNumber: null,
        category: null,
        estimatedCost: city.hotel.pricePerNight,
        currency: city.hotel.currency,
        verification: verificationOf(city.hotel),
        order: null,
      });
    }
  }

  for (const day of trip.days) {
    const city = cityById.get(day.cityId);
    day.activities.forEach((activity, index) => {
      if (!activity.location) return;
      points.push({
        id: activity.id,
        kind: "activity",
        name: activity.name,
        location: activity.location,
        cityId: day.cityId,
        cityName: city?.name ?? "",
        dayId: day.id,
        dayNumber: day.dayNumber,
        category: activity.category,
        estimatedCost: activity.estimatedCost,
        currency: activity.currency,
        verification: verificationOf(activity),
        order: index + 1,
      });
    });
  }

  return points;
}

export function filterMapPoints(points: MapPoint[], filter: MapFilter): MapPoint[] {
  switch (filter.mode) {
    case "city":
      return filter.cityId ? points.filter((p) => p.cityId === filter.cityId) : points;
    case "day":
      // A city's hotel has no day of its own, but it's where that day starts
      // and ends — keep it visible so a day's route makes sense.
      return filter.dayId
        ? points.filter(
            (p) => p.dayId === filter.dayId || (p.kind === "hotel" && p.cityId === filter.cityId),
          )
        : points;
    default:
      return points;
  }
}

/**
 * The ordered points for a single day, used to draw the itinerary-order line.
 * This is the order the traveller planned to visit them in — not a routed or
 * driveable path, and the UI says so.
 */
export function routeForDay(points: MapPoint[], dayId: string | null): MapPoint[] {
  if (!dayId) return [];
  return points
    .filter((p) => p.dayId === dayId && p.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** How many itinerary entries couldn't be mapped, so the UI can say so honestly. */
export function countUnmappablePlaces(trip: Trip): number {
  const missingHotels = trip.cities.filter((c) => !c.hotel.location).length;
  const missingActivities = trip.days.reduce(
    (sum, day) => sum + day.activities.filter((a) => !a.location).length,
    0,
  );
  return missingHotels + missingActivities;
}
