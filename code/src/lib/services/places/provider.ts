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
  /**
   * Free-text the traveller typed, for the "find a real place" picker. When
   * present a live provider searches on this directly instead of building a
   * category query from `type`.
   */
  query?: string;
}

/**
 * Every travel-data source — the built-in mock content or a live API —
 * implements this one interface. The itinerary generator and the search API
 * route only ever talk to a `PlacesProvider`, so switching providers (see
 * `getPlacesProvider` in `./index.ts`) never requires touching the
 * generator, the roadmap, or the map.
 *
 * Implementations must not throw for ordinary "no results" cases — they
 * return an empty array. They throw `PlacesProviderError` only for genuine
 * failures (bad key, quota, network, malformed response) so callers can
 * decide between falling back to mock content and surfacing a message.
 */
export interface PlacesProvider {
  readonly name: "mock" | "google";
  searchPlaces(params: PlaceSearchParams): Promise<Place[]>;
  /**
   * Re-fetch one place by the provider's own stable id. Used to refresh a
   * saved itinerary entry (coordinates, rating, website) without re-running
   * a whole search. Returns null when the id is unknown to the provider.
   */
  getPlaceDetails(providerPlaceId: string, options?: { currency?: string }): Promise<Place | null>;
}
