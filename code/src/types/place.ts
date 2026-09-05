import type { ActivityCategory, TravelStyle } from "./itinerary";

/**
 * The travel-data model shared by every places provider (mock or live).
 * `lib/services/places/*` is the only code that produces `Place` values;
 * the itinerary generator converts them into `Activity`/`Hotel` records
 * (see `placeToActivity`/`placeToHotel` in `itinerary-generator.ts`), and
 * nothing downstream of that needs to know which provider a place came from.
 */

export type PlaceType = "attraction" | "restaurant" | "hotel" | "nightlife";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Never fabricated: null when the provider doesn't supply a real rating. */
export interface Rating {
  value: number;
  count: number | null;
}

/**
 * A cost estimate attached to a place. `isEstimate` is true for essentially
 * every value in this app today (mock content is a realistic guess; a
 * provider like Google Places only ever returns a coarse `priceLevel`
 * enum, never an exact amount) — it exists so the UI can say "estimated"
 * rather than imply a verified, bookable price.
 */
export interface PriceInfo {
  amount: number;
  currency: string;
  isEstimate: boolean;
}

/** Where a place's data came from, so the UI can show real provenance. */
export interface SourceRef {
  provider: "mock" | "google";
  /** A real, working URL (e.g. a Wikipedia article or Google Maps place page). Never fabricated. */
  sourceUrl: string | null;
  /** Human-readable label for the source, e.g. "Wikipedia" or "Google Places". */
  sourceName: string | null;
}

export interface Place {
  /** Provider-namespaced, e.g. "mock:grand-palace" or "google:ChIJ...". */
  id: string;
  type: PlaceType;
  name: string;
  description: string;
  category: ActivityCategory;
  /** Coarse travel-style tags used to rank places against the traveller's preferences. */
  styleTags: TravelStyle[];
  location: LatLng | null;
  address: string | null;
  /** Relative URL into this app's image proxy (see `/api/places/photo`), never a raw provider URL with a key attached. */
  imageUrl: string | null;
  rating: Rating | null;
  price: PriceInfo | null;
  durationMinutes: number | null;
  /** Restaurants only: which itinerary meal slots this place suits. */
  mealTypes: ("breakfast" | "lunch" | "dinner")[] | null;
  source: SourceRef;
  /** True when the place itself (not just its price) is placeholder/demo content. */
  isDemoData: boolean;
}

export type Attraction = Place & { type: "attraction" };
export type Restaurant = Place & { type: "restaurant" };
export type HotelPlace = Place & { type: "hotel" };
