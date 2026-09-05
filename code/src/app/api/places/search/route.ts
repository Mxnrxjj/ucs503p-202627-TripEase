import { NextRequest, NextResponse } from "next/server";
import { getMockPlacesProvider, getPlacesProvider, placesProviderStatus } from "@/lib/services/places";
import { friendlyPlacesMessage, PlacesProviderError } from "@/lib/services/places/errors";
import { placeSearchRequestSchema, placeSchema } from "@/lib/validation/places";
import type { Place } from "@/types/place";

/**
 * POST /api/places/search
 *
 * Backs the "find a real place" picker used when a traveller replaces an
 * activity. Runs server-side for the same reason trip generation does: the
 * provider key is read from `process.env` here and never reaches the
 * browser. Components call this route; they never touch a provider directly.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = placeSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }

  const { query, destination, country, type, currency, limit } = parsed.data;
  const params = { destination, country, type, currency, limit, query };
  const status = placesProviderStatus();

  let places: Place[] = [];
  let notice: string | null = null;

  try {
    places = await getPlacesProvider().searchPlaces(params);
  } catch (error) {
    // A live-provider failure degrades to demo results rather than an error
    // screen — the traveller can still pick something and keep planning.
    const code = error instanceof PlacesProviderError ? error.code : "provider-error";
    console.error("[places] search failed", error);
    notice = friendlyPlacesMessage(code);
    places = await getMockPlacesProvider().searchPlaces(params);
  }

  if (places.length === 0 && status.live) {
    places = await getMockPlacesProvider().searchPlaces(params);
    notice = notice ?? "No live matches for that search — showing demo places instead.";
  }

  // Validate our own normalized shape before it leaves the server: a mapping
  // bug in a provider should fail here, not corrupt a saved itinerary.
  const validated = places.filter((place) => placeSchema.safeParse(place).success);

  return NextResponse.json({
    places: validated,
    provider: status.provider,
    live: status.live,
    notice,
  });
}
