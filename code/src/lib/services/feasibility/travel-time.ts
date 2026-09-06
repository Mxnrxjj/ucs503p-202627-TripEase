import type { LatLng } from "@/types/place";
import type { TravelMode } from "@/types/travel";
import { haversineKm } from "./geo";

/**
 * Travel-time estimation.
 *
 * These are **heuristics, not routes**. Nothing here calls a routing API, and
 * every result is flagged `isEstimated: true` so the UI can say "estimated"
 * rather than implying a real routed journey. The provider seam exists so a
 * Google Routes (or OSRM, or Valhalla) implementation can replace the
 * heuristic later without touching the feasibility engine or the UI.
 */

export interface TravelEstimate {
  distanceKm: number | null;
  minutes: number;
  mode: TravelMode;
  isEstimated: boolean;
}

export interface TravelContext {
  /** Same-city hops are city traffic; between cities is intercity transport. */
  sameCity: boolean;
}

export interface TravelTimeProvider {
  readonly name: string;
  estimate(from: LatLng | null, to: LatLng | null, context: TravelContext): TravelEstimate;
}

/**
 * Straight-line distance understates real travel: roads bend, and city grids
 * bend them more. These multipliers turn a great-circle distance into
 * something closer to a journey. Flights are the exception — they really do
 * go more or less straight.
 */
const ROAD_DETOUR_FACTOR = 1.3;
const FLIGHT_DETOUR_FACTOR = 1.0;

/**
 * Mode bands by straight-line distance, with an effective door-to-door speed
 * and a fixed overhead. The overheads are what make this honest: a 600 km
 * flight is not 50 minutes, it's 50 minutes plus getting to an airport,
 * checking in, and getting out the other end.
 */
interface Band {
  maxKm: number;
  mode: TravelMode;
  speedKmh: number;
  overheadMinutes: number;
}

const LOCAL_BANDS: Band[] = [
  { maxKm: 1.2, mode: "walk", speedKmh: 4.5, overheadMinutes: 0 },
  { maxKm: 6, mode: "car", speedKmh: 16, overheadMinutes: 5 },
  { maxKm: 30, mode: "car", speedKmh: 24, overheadMinutes: 8 },
  { maxKm: Infinity, mode: "car", speedKmh: 45, overheadMinutes: 10 },
];

const INTERCITY_BANDS: Band[] = [
  { maxKm: 30, mode: "car", speedKmh: 35, overheadMinutes: 15 },
  { maxKm: 120, mode: "car", speedKmh: 55, overheadMinutes: 20 },
  { maxKm: 400, mode: "train", speedKmh: 110, overheadMinutes: 45 },
  { maxKm: Infinity, mode: "flight", speedKmh: 700, overheadMinutes: 180 },
];

function bandFor(distanceKm: number, sameCity: boolean): Band {
  const bands = sameCity ? LOCAL_BANDS : INTERCITY_BANDS;
  return bands.find((b) => distanceKm <= b.maxKm) ?? bands[bands.length - 1];
}

export class HeuristicTravelTimeProvider implements TravelTimeProvider {
  readonly name = "heuristic";

  estimate(from: LatLng | null, to: LatLng | null, context: TravelContext): TravelEstimate {
    const straightLineKm = haversineKm(from, to);

    if (straightLineKm === null) {
      // Unknown coordinates: don't guess a distance, but a transfer between
      // two cities still obviously takes time, so allow a conservative
      // placeholder there rather than pretending it's instant.
      return {
        distanceKm: null,
        minutes: context.sameCity ? 20 : 180,
        mode: "unknown",
        isEstimated: true,
      };
    }

    const band = bandFor(straightLineKm, context.sameCity);
    const detour = band.mode === "flight" ? FLIGHT_DETOUR_FACTOR : ROAD_DETOUR_FACTOR;
    const travelKm = straightLineKm * detour;
    const minutes = Math.round(band.overheadMinutes + (travelKm / band.speedKmh) * 60);

    return {
      distanceKm: Math.round(travelKm * 10) / 10,
      // Even next door takes a few minutes to get to and into.
      minutes: Math.max(5, minutes),
      mode: band.mode,
      isEstimated: true,
    };
  }
}

/** The provider in use. A routing-API implementation would be selected here. */
export function getTravelTimeProvider(): TravelTimeProvider {
  return new HeuristicTravelTimeProvider();
}
