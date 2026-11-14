/**
 * Provider failures are classified rather than thrown as raw strings so the
 * layers above can react sensibly. TripEase has no stand-in data: when the
 * places service fails, or has nothing for somewhere, the traveller is told so,
 * in words that say what to do, and the trip is not built from invented places.
 * The API routes turn the code into a friendly, non-leaky message (a raw Google
 * error body can contain project ids and key hints, so it is never shown).
 */
export type PlacesErrorCode =
  | "missing-key"
  | "invalid-key"
  | "quota-exceeded"
  | "network"
  | "malformed-response"
  | "provider-error"
  /** The service answered, but has nothing for what was asked (a hotel, or any sights, in a city). */
  | "no-results";

export class PlacesProviderError extends Error {
  constructor(
    readonly code: PlacesErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PlacesProviderError";
  }
}

/**
 * One of the trip's places has no hotels, or nothing to see, in the places
 * service. Unlike other failures this is TripEase's own finding, not upstream
 * text, so it can be shown and can name the place: that is what the traveller
 * needs in order to fix it.
 */
export class PlaceNotFoundError extends PlacesProviderError {
  constructor(
    readonly place: string,
    readonly missing: "hotels" | "sights",
  ) {
    super("no-results", missing === "hotels" ? `No hotels were found in ${place}.` : `Nothing to see was found in ${place}.`);
    this.name = "PlaceNotFoundError";
  }
}

/** What to tell the traveller when one of their places can't be found in `country`. */
export function placeNotFoundMessage(error: PlaceNotFoundError, country: string): string {
  const what = error.missing === "hotels" ? "No hotels" : "Nothing to see";
  return `${what} could be found in ${error.place}. Check that it's spelled right and is in ${country}, or try a bigger town nearby.`;
}

/** Maps an upstream HTTP status onto a provider error code. */
export function codeForHttpStatus(status: number): PlacesErrorCode {
  if (status === 400 || status === 401 || status === 403) return "invalid-key";
  if (status === 429) return "quota-exceeded";
  return "provider-error";
}

/** A short, safe message for end users: never includes upstream response text. */
export function friendlyPlacesMessage(code: PlacesErrorCode): string {
  switch (code) {
    case "missing-key":
      return "Place search isn't set up on this server, so TripEase can't look up real places right now.";
    case "invalid-key":
      return "Place search is misconfigured on this server, so TripEase can't look up real places right now.";
    case "quota-exceeded":
      return "Place search has hit its usage limit for now. Try again in a little while.";
    case "network":
      return "Couldn't reach the place search service. Check your connection and try again.";
    case "malformed-response":
      return "Got an unexpected response from the place search service. Try again.";
    case "no-results":
      return "The place search service has no places for that. Try a different search.";
    default:
      return "Place search is temporarily unavailable. Try again in a moment.";
  }
}

/** The HTTP status a route should answer with for this failure. */
export function statusForPlacesError(code: PlacesErrorCode): number {
  switch (code) {
    case "no-results":
      return 422;
    case "malformed-response":
      return 502;
    default:
      return 503;
  }
}
