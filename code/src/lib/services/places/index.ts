import { GooglePlacesProvider } from "./google-provider";
import { MockPlacesProvider } from "./mock-provider";
import type { PlacesProvider } from "./provider";

export type { Place, PlaceType, LatLng, Rating, PriceInfo, SourceRef } from "@/types/place";
export type { PlaceSearchParams, PlacesProvider } from "./provider";

/**
 * The one place a provider gets chosen. Everything else in the app depends
 * only on the `PlacesProvider` interface, so adding a third provider later
 * means adding a branch here — no other file needs to change.
 *
 * `PLACES_PROVIDER=google` + a real `GOOGLE_PLACES_API_KEY` switches to live
 * data; anything else (including a missing key) uses the offline mock
 * provider, so the app always works without any external credentials.
 */
export function getPlacesProvider(): PlacesProvider {
  const wantsGoogle = process.env.PLACES_PROVIDER === "google";
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (wantsGoogle && apiKey) {
    return new GooglePlacesProvider(apiKey);
  }
  if (wantsGoogle && !apiKey) {
    console.warn(
      "[places] PLACES_PROVIDER=google but GOOGLE_PLACES_API_KEY is not set — falling back to mock data.",
    );
  }
  return new MockPlacesProvider();
}
