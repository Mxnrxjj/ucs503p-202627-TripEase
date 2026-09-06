/**
 * Travel feasibility: the layer that answers "can this day actually happen?"
 *
 * Everything here is *derived*, never persisted. Segments and feasibility are
 * computed from a trip's activities and their coordinates on demand, which
 * means a trip saved before this iteration analyses correctly with no
 * migration, and any edit (add, delete, reorder, change city) is re-evaluated
 * for free rather than leaving stale numbers in Firestore.
 */

export type TravelMode = "walk" | "car" | "transit" | "train" | "flight" | "unknown";

export interface TravelSegment {
  id: string;
  type: "city-transfer" | "local-transfer";
  /** Activity id, or `hotel:<cityId>` for a stay. Null when the end isn't a mapped place. */
  fromPlaceId: string | null;
  toPlaceId: string | null;
  fromCity: string | null;
  toCity: string | null;
  /** Straight-line distance, adjusted for typical road detour. Null when either end lacks coordinates. */
  distanceKm: number | null;
  estimatedDurationMinutes: number;
  mode: TravelMode;
  estimatedCost: number | null;
  currency: string | null;
  /**
   * True whenever the duration came from the heuristic estimator rather than a
   * routing provider — which is every segment today. The UI must not present
   * these as real routed times.
   */
  isEstimated: boolean;
}

export type FeasibilitySeverity = "info" | "warning" | "problem";

export type FeasibilityCode =
  | "city-transfer"
  | "long-travel"
  | "over-capacity"
  | "tight-schedule"
  | "outside-opening-hours"
  | "far-from-city"
  | "missing-coordinates";

export interface FeasibilityWarning {
  code: FeasibilityCode;
  severity: FeasibilitySeverity;
  /** Plain language, written for a traveller rather than a developer. */
  message: string;
  activityId?: string | null;
}

export interface DayFeasibility {
  dayId: string;
  feasible: boolean;
  activityMinutes: number;
  travelMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  availableMinutes: number;
  warnings: FeasibilityWarning[];
}

/** Everything the UI needs to render one day's travel reality. */
export interface DayPlan {
  dayId: string;
  segments: TravelSegment[];
  feasibility: DayFeasibility;
}

export interface TripFeasibility {
  days: Record<string, DayPlan>;
  /** Days that couldn't be made to fit, for a trip-level summary. */
  infeasibleDayNumbers: number[];
  totalTravelMinutes: number;
}
