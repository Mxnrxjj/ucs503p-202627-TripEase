import type { TravelStyle } from "@/types/itinerary";
import type { Place, PlaceType } from "@/types/place";

export interface PlaceSearchParams {
  /** A city (or, for a generic fallback, a whole destination) name, e.g. "Bangkok". */
  destination: string;
  /** The country the destination is in, when known — improves query precision for a live provider. */
  country?: string;
  type: PlaceType;
  /** Used to rank/bias results (mock: matches curated style tags; google: biases the query text). */
  preferences?: TravelStyle[];
  /** Restaurants only — narrows to places suited to that meal. */
  mealType?: "breakfast" | "lunch" | "dinner";
  /** Currency for any price estimate attached to a result. Defaults to "INR". */
  currency?: string;
  limit?: number;
}

/**
 * Every travel-data source — the built-in mock content or a live API —
 * implements this one interface. The itinerary generator only ever talks
 * to a `PlacesProvider`, so switching providers (see `getPlacesProvider` in
 * `./index.ts`) never requires touching the generator or any UI.
 */
export interface PlacesProvider {
  readonly name: "mock" | "google";
  searchPlaces(params: PlaceSearchParams): Promise<Place[]>;
}
