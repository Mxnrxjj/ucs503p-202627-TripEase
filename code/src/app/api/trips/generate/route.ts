import { NextRequest, NextResponse } from "next/server";
import { generateItinerary } from "@/lib/services/itinerary-generator";
import { generatedItinerarySchema, tripDraftInputSchema } from "@/lib/validation/trip";

/**
 * POST /api/trips/generate
 *
 * Create Trip Form -> this route -> itinerary generator -> places provider
 * (mock, or Google Places when configured) -> structured JSON -> Zod
 * validation -> response.
 *
 * This route runs server-side only, which is why it — and not the client —
 * is where `lib/services/places` resolves a provider: a live provider's API
 * key (`GOOGLE_PLACES_API_KEY`) is read from `process.env` here and never
 * sent to the browser. See `lib/services/places/index.ts`.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsedInput = tripDraftInputSchema.safeParse(body);
  if (!parsedInput.success) {
    return NextResponse.json(
      { error: "Invalid trip details.", issues: parsedInput.error.issues },
      { status: 400 },
    );
  }

  if (parsedInput.data.endDate < parsedInput.data.startDate) {
    return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400 });
  }

  try {
    const itinerary = await generateItinerary(parsedInput.data);
    const parsedOutput = generatedItinerarySchema.safeParse(itinerary);
    if (!parsedOutput.success) {
      console.error("Generated itinerary failed validation", parsedOutput.error);
      return NextResponse.json(
        { error: "Couldn't build a valid itinerary. Please try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ itinerary: parsedOutput.data });
  } catch (error) {
    console.error("Itinerary generation failed", error);
    return NextResponse.json(
      { error: "Something went wrong while planning your trip." },
      { status: 500 },
    );
  }
}
