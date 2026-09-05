import { GooglePlacesProvider } from "./google-provider";
import { MockPlacesProvider } from "./mock-provider";
import type { PlacesProvider } from "./provider";

export type { Place, PlaceType, LatLng, Rating, PriceInfo, SourceRef } from "@/types/place";
export type { PlaceSearchParams, PlacesProvider } from "./provider";
export { PlacesProviderError, friendlyPlacesMessage } from "./errors";

/**
 * The one place a provider gets chosen. Everything else in the app depends
 * only on the `PlacesProvider` interface, so adding a third provider later
 * means adding a branch here — no other file needs to change.
 *
 * `PLACES_PROVIDER=google` + a real `GOOGLE_PLACES_API_KEY` switches to live
 * data; anything else (including a missing key) uses the offline mock
 * provider, so the app always works without any external credentials.
 *
 * Server-only: `GOOGLE_PLACES_API_KEY` has no `NEXT_PUBLIC_` prefix, so
 * calling this from a client component would silently get you the mock
 * provider. Call it from route handlers/server code only.
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

/** The always-available fallback, used when a live search comes back empty or fails. */
export function getMockPlacesProvider(): PlacesProvider {
  return new MockPlacesProvider();
}

/**
 * Whether live data is actually configured. Safe to send to the client — it
 * reports only *that* a provider is configured, never the key itself.
 */
export function placesProviderStatus(): { provider: "mock" | "google"; live: boolean } {
  const live = process.env.PLACES_PROVIDER === "google" && Boolean(process.env.GOOGLE_PLACES_API_KEY);
  return { provider: live ? "google" : "mock", live };
}
