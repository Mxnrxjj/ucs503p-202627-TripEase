/**
 * Provider failures are classified rather than thrown as raw strings so the
 * layers above can react sensibly: the itinerary generator falls back to
 * mock content for any of them, and the search API route turns the code
 * into a friendly, non-leaky message for the UI (a raw Google error body
 * can contain project ids and key hints — never show it to a user).
 */
export type PlacesErrorCode =
  | "missing-key"
  | "invalid-key"
  | "quota-exceeded"
  | "network"
  | "malformed-response"
  | "provider-error";

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

/** Maps an upstream HTTP status onto a provider error code. */
export function codeForHttpStatus(status: number): PlacesErrorCode {
  if (status === 400 || status === 401 || status === 403) return "invalid-key";
  if (status === 429) return "quota-exceeded";
  return "provider-error";
}

/** A short, safe message for end users — never includes upstream response text. */
export function friendlyPlacesMessage(code: PlacesErrorCode): string {
  switch (code) {
    case "missing-key":
      return "Live place search isn't configured. Showing demo places instead.";
    case "invalid-key":
      return "Live place search is misconfigured. Showing demo places instead.";
    case "quota-exceeded":
      return "Live place search has hit its usage limit for now. Showing demo places instead.";
    case "network":
      return "Couldn't reach the place search service. Check your connection and try again.";
    case "malformed-response":
      return "Got an unexpected response from the place search service.";
    default:
      return "Place search is temporarily unavailable.";
  }
}
