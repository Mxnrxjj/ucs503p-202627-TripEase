import type { BudgetBreakdown } from "./budget";
import type { City, TravelerType, TravelStyle, TripDay } from "./itinerary";
import type { CityPlan } from "./planning";

export type TripStatus = "generating" | "ready";

/**
 * A trip is stored as a single Firestore document. Iteration 1 modelled a
 * trip as a flat list of places; V1 replaces that with the richer
 * city/day/activity structure the roadmap and budget views need. At this
 * scale (a handful of cities, a couple of dozen activities) the whole trip
 * comfortably fits well under Firestore's 1MiB document limit, so denormalizing
 * everything into one document keeps reads and edits a single round trip.
 */
export interface Trip {
  id: string;
  ownerId: string;
  status: TripStatus;

  destination: string;
  title: string;
  startDate: string;
  endDate: string;
  dayCount: number;

  currency: string;
  travelers: number;
  travelerType: TravelerType;
  preferences: TravelStyle[];

  cities: City[];
  days: TripDay[];

  budget: BudgetBreakdown;

  /**
   * How this trip's cities were chosen. Optional so trips saved before the
   * planner existed still load; absent simply means "planned by an earlier
   * version of TripEase".
   */
  planning?: CityPlan | null;

  createdAt: Date;
  updatedAt: Date;
}

/** The subset of a trip decided in the create-trip wizard, before generation. */
export interface TripDraftInput {
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  travelers: number;
  travelerType: TravelerType;
  preferences: TravelStyle[];
}

/** What the itinerary generator produces; validated, then persisted as a Trip. */
export interface GeneratedItinerary {
  destination: string;
  title: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  currency: string;
  cities: City[];
  days: TripDay[];
  budget: BudgetBreakdown;
}
