import { formatDurationShort } from "@/lib/utils";
import type { Activity, City, TripDay } from "@/types/itinerary";
import type { LatLng } from "@/types/place";
import type {
  DayFeasibility,
  DayPlan,
  FeasibilityWarning,
  TravelSegment,
  TripFeasibility,
} from "@/types/travel";
import type { Trip } from "@/types/trip";
import { totalActivityMinutes } from "./durations";
import { centroid, haversineKm, isValidCoordinate } from "./geo";
import { getTravelTimeProvider, type TravelTimeProvider } from "./travel-time";

/**
 * The deterministic half of planning.
 *
 * The AI decides *which* cities; Google supplies *what's really there*; this
 * decides whether the result can physically happen — how far apart the places
 * are, how long getting between them takes, and whether the day adds up.
 *
 * All of it is derived from the saved trip, so it costs no API calls, works on
 * trips saved before it existed, and re-evaluates automatically after an edit.
 */

/** A realistic sightseeing window: 09:00–21:00. */
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 21 * 60;
const AVAILABLE_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;

/** Getting in, queueing, orienting — real time that no itinerary lists. */
const BASE_BUFFER_MINUTES = 30;
const BUFFER_PER_ACTIVITY_MINUTES = 10;

/** Above this, a day is mostly spent in transit whatever else is on it. */
const LONG_TRAVEL_MINUTES = 180;
/**
 * Beyond this from the city it's filed under, a stop probably isn't in that
 * city at all. Set well past a plausible day-trip radius (Ayutthaya is 80 km
 * from Bangkok, Pattaya 150) so a genuine excursion isn't called an error —
 * this is aimed at a place search that wandered into the wrong province.
 */
const FAR_FROM_CITY_KM = 200;
/** Within this of the limit, the day is technically possible but unforgiving. */
const TIGHT_SCHEDULE_MARGIN = 45;

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

/**
 * Where a city "is", for measuring transfers. Uses the hotel if it has
 * coordinates, otherwise the centre of that city's mapped places. A city with
 * nothing mapped returns null — we don't look up or invent a city centre.
 */
export function cityAnchor(city: City, days: TripDay[]): LatLng | null {
  if (isValidCoordinate(city.hotel.location)) return city.hotel.location;
  const cityDays = days.filter((d) => d.cityId === city.id);
  return centroid(cityDays.flatMap((d) => d.activities.map((a) => a.location)));
}

interface DayContext {
  day: TripDay;
  city: City | null;
  previousCity: City | null;
  isFirstDayOfCity: boolean;
  cityAnchors: Map<string, LatLng | null>;
}

/**
 * Build the travel between a day's stops: hotel → first place, place to place,
 * and (on an arrival day) the intercity transfer that gets you there at all.
 */
export function buildDaySegments(context: DayContext, provider: TravelTimeProvider): TravelSegment[] {
  const { day, city, previousCity, isFirstDayOfCity, cityAnchors } = context;
  const segments: TravelSegment[] = [];

  // A city change is a planning event in its own right, not just another stop.
  if (isFirstDayOfCity && previousCity && city) {
    const from = cityAnchors.get(previousCity.id) ?? null;
    const to = cityAnchors.get(city.id) ?? null;
    const estimate = provider.estimate(from, to, { sameCity: false });

    // The generator already books the transfer's cost as a transport activity,
    // which the budget engine counts. Reuse that figure rather than inventing
    // a second one — and never double-charge the trip.
    const transferActivity = day.activities.find((a) => a.category === "transport");

    segments.push({
      id: makeId("seg"),
      type: "city-transfer",
      fromPlaceId: null,
      toPlaceId: null,
      fromCity: previousCity.name,
      toCity: city.name,
      distanceKm: estimate.distanceKm,
      estimatedDurationMinutes: Math.max(estimate.minutes, transferActivity?.durationMinutes ?? 0),
      mode: estimate.mode,
      estimatedCost: transferActivity?.estimatedCost ?? null,
      currency: transferActivity?.currency ?? null,
      isEstimated: true,
    });
  }

  segments.push(
    ...localSegments(day.activities, {
      hotelLocation: city && isValidCoordinate(city.hotel.location) ? city.hotel.location! : null,
      hotelId: city ? `hotel:${city.id}` : null,
      cityName: city?.name ?? null,
      provider,
    }),
  );

  return segments;
}

export interface LocalTravelContext {
  /** Where the day starts and ends. Null when the hotel has no coordinates. */
  hotelLocation: LatLng | null;
  hotelId: string | null;
  cityName: string | null;
  provider: TravelTimeProvider;
}

/**
 * The hops within a single day: hotel → first stop, stop to stop, last stop →
 * hotel. Split out from `buildDaySegments` so the itinerary generator can price
 * a day's travel with exactly the same arithmetic the engine will later judge
 * it by — otherwise the generator could happily emit days the engine calls
 * impossible.
 */
export function localSegments(activities: Activity[], context: LocalTravelContext): TravelSegment[] {
  const { hotelLocation, hotelId, cityName, provider } = context;
  const segments: TravelSegment[] = [];

  // Transport entries are represented by a city-transfer segment, so they're
  // skipped here rather than counted as somewhere you visit.
  const stops = activities.filter((a) => a.category !== "transport");

  let previousPoint: LatLng | null = hotelLocation;
  let previousId: string | null = hotelLocation ? hotelId : null;

  for (const stop of stops) {
    if (!isValidCoordinate(stop.location)) {
      // No coordinates means no measurable hop. Skipped, and surfaced as a
      // warning by the evaluator rather than guessed at.
      continue;
    }
    if (previousPoint) {
      const estimate = provider.estimate(previousPoint, stop.location, { sameCity: true });
      segments.push({
        id: makeId("seg"),
        type: "local-transfer",
        fromPlaceId: previousId,
        toPlaceId: stop.id,
        fromCity: cityName,
        toCity: cityName,
        distanceKm: estimate.distanceKm,
        estimatedDurationMinutes: estimate.minutes,
        mode: estimate.mode,
        estimatedCost: null,
        currency: null,
        isEstimated: true,
      });
    }
    previousPoint = stop.location!;
    previousId = stop.id;
  }

  // And back to the hotel at the end of the day.
  if (hotelLocation && previousPoint && previousId !== hotelId) {
    const estimate = provider.estimate(previousPoint, hotelLocation, { sameCity: true });
    segments.push({
      id: makeId("seg"),
      type: "local-transfer",
      fromPlaceId: previousId,
      toPlaceId: hotelId,
      fromCity: cityName,
      toCity: cityName,
      distanceKm: estimate.distanceKm,
      estimatedDurationMinutes: estimate.minutes,
      mode: estimate.mode,
      estimatedCost: null,
      currency: null,
      isEstimated: true,
    });
  }

  return segments;
}

/** The buffer a set of stops attracts: getting in, queueing, orienting. */
export function bufferMinutesFor(activities: Activity[]): number {
  const stops = activities.filter((a) => a.category !== "transport").length;
  return stops > 0 ? BASE_BUFFER_MINUTES + stops * BUFFER_PER_ACTIVITY_MINUTES : 0;
}

/**
 * What a day would total if it held exactly these activities — the same sum
 * `evaluateDay` computes, exposed so the generator can check a day *before*
 * committing to it. `committedTravelMinutes` covers travel the day already owes
 * that isn't a local hop, i.e. an intercity transfer.
 */
export function projectDayMinutes(
  activities: Activity[],
  options: {
    hotelLocation: LatLng | null;
    committedTravelMinutes?: number;
    provider?: TravelTimeProvider;
  },
): number {
  const provider = options.provider ?? getTravelTimeProvider();
  const travel = localSegments(activities, {
    hotelLocation: options.hotelLocation,
    hotelId: "hotel",
    cityName: null,
    provider,
  }).reduce((sum, s) => sum + s.estimatedDurationMinutes, 0);

  return (
    totalActivityMinutes(activities) +
    travel +
    (options.committedTravelMinutes ?? 0) +
    bufferMinutesFor(activities)
  );
}

/** Does this day fit in a day? */
export function evaluateDay(
  day: TripDay,
  segments: TravelSegment[],
  options?: {
    availableMinutes?: number;
    /** Where this day's city is, for spotting a stop that isn't in it. */
    cityAnchor?: LatLng | null;
    cityName?: string | null;
  },
): DayFeasibility {
  const availableMinutes = options?.availableMinutes ?? AVAILABLE_MINUTES;
  const stops = day.activities.filter((a) => a.category !== "transport");

  const activityMinutes = totalActivityMinutes(day.activities);
  const travelMinutes = segments.reduce((sum, s) => sum + s.estimatedDurationMinutes, 0);
  const bufferMinutes = bufferMinutesFor(day.activities);
  const totalMinutes = activityMinutes + travelMinutes + bufferMinutes;

  const warnings: FeasibilityWarning[] = [];
  const transfer = segments.find((s) => s.type === "city-transfer");

  if (transfer) {
    warnings.push({
      code: "city-transfer",
      severity: "info",
      message: `${transfer.fromCity} → ${transfer.toCity} takes about ${formatDurationShort(
        transfer.estimatedDurationMinutes,
      )} of this day (estimated).`,
    });
  }

  if (travelMinutes >= LONG_TRAVEL_MINUTES) {
    warnings.push({
      code: "long-travel",
      severity: "warning",
      message: `Long travel day — around ${formatDurationShort(travelMinutes)} on the move (estimated).`,
    });
  }

  const feasible = totalMinutes <= availableMinutes;
  if (!feasible) {
    warnings.push({
      code: "over-capacity",
      severity: "problem",
      message: `This day is planned for about ${formatDurationShort(
        totalMinutes,
      )}, more than a comfortable ${formatDurationShort(availableMinutes)} day. Consider moving something.`,
    });
  } else if (availableMinutes - totalMinutes <= TIGHT_SCHEDULE_MARGIN && stops.length > 0) {
    warnings.push({
      code: "tight-schedule",
      severity: "warning",
      message: "Tight schedule — there's very little slack in this day.",
    });
  }

  // A stop hundreds of kilometres from its own city is almost always a place
  // search that landed in the wrong province — a beach in Chumphon filed under
  // Bangkok, say. Worth saying out loud: the traveller is the only one who can
  // decide whether to keep it.
  if (isValidCoordinate(options?.cityAnchor)) {
    for (const stop of stops) {
      const km = haversineKm(options!.cityAnchor!, stop.location);
      if (km !== null && km > FAR_FROM_CITY_KM) {
        warnings.push({
          code: "far-from-city",
          severity: "warning",
          message: `${stop.name} is about ${Math.round(km)} km from ${
            options?.cityName ?? "this city"
          } — check it belongs on this day.`,
        });
      }
    }
  }

  const unmapped = stops.filter((a) => !isValidCoordinate(a.location)).length;
  if (unmapped > 0) {
    warnings.push({
      code: "missing-coordinates",
      severity: "info",
      message: `${unmapped} ${unmapped === 1 ? "place has" : "places have"} no location yet, so travel to ${
        unmapped === 1 ? "it isn't" : "them isn't"
      } included.`,
    });
  }

  return {
    dayId: day.id,
    feasible,
    activityMinutes,
    travelMinutes,
    bufferMinutes,
    totalMinutes,
    availableMinutes,
    warnings,
  };
}

/**
 * Analyse a whole trip. Cheap enough to run on every render and after every
 * edit — it's arithmetic over data already in memory.
 */
export function analyzeTrip(trip: Trip, provider: TravelTimeProvider = getTravelTimeProvider()): TripFeasibility {
  const cities = [...trip.cities].sort((a, b) => a.order - b.order);
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const cityAnchors = new Map<string, LatLng | null>(cities.map((c) => [c.id, cityAnchor(c, trip.days)]));

  const orderedDays = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const firstDayIdByCity = new Map<string, string>();
  for (const day of orderedDays) {
    if (!firstDayIdByCity.has(day.cityId)) firstDayIdByCity.set(day.cityId, day.id);
  }

  const days: Record<string, DayPlan> = {};
  const infeasibleDayNumbers: number[] = [];
  let totalTravelMinutes = 0;

  for (const day of orderedDays) {
    const city = cityById.get(day.cityId) ?? null;
    const cityIndex = city ? cities.findIndex((c) => c.id === city.id) : -1;
    const previousCity = cityIndex > 0 ? cities[cityIndex - 1] : null;

    const segments = buildDaySegments(
      {
        day,
        city,
        previousCity,
        isFirstDayOfCity: firstDayIdByCity.get(day.cityId) === day.id,
        cityAnchors,
      },
      provider,
    );

    const feasibility = evaluateDay(day, segments, {
      cityAnchor: city ? (cityAnchors.get(city.id) ?? null) : null,
      cityName: city?.name ?? null,
    });
    days[day.id] = { dayId: day.id, segments, feasibility };
    totalTravelMinutes += feasibility.travelMinutes;
    if (!feasibility.feasible) infeasibleDayNumbers.push(day.dayNumber);
  }

  return { days, infeasibleDayNumbers, totalTravelMinutes };
}

export { AVAILABLE_MINUTES, DAY_START_MINUTES, DAY_END_MINUTES };
export type { Activity };
