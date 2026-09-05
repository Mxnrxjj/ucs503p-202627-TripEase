import { fromInr } from "@/lib/mock-data/fx";
import { googleTextSearchResponseSchema, type GoogleRawPlace } from "@/lib/validation/places";
import type { ActivityCategory, TravelStyle } from "@/types/itinerary";
import type { Place, PlaceType, Rating } from "@/types/place";
import type { PlaceSearchParams, PlacesProvider } from "./provider";

/**
 * Live provider backed by the Places API (New) `searchText` endpoint.
 * `GOOGLE_PLACES_API_KEY` is a server-only env var (no `NEXT_PUBLIC_`
 * prefix) — this class is only ever instantiated in `getPlacesProvider()`,
 * which is only ever called from a server context (the `/api/trips/generate`
 * route), so the key never reaches the client. Photo URLs are relative
 * links into `/api/places/photo`, which is the only place the key touches
 * an outgoing request besides this file.
 *
 * Google Places does not return an exact price for attractions or
 * restaurants, and rarely returns one for hotels — only a coarse
 * `priceLevel` enum. Amounts derived from it are always marked
 * `price.isEstimate = true`; we never present an inferred number as a
 * verified price.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.editorialSummary",
  "places.types",
  "places.photos",
].join(",");

const PRICE_LEVEL_TO_INR: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 500,
  PRICE_LEVEL_MODERATE: 1_500,
  PRICE_LEVEL_EXPENSIVE: 3_500,
  PRICE_LEVEL_VERY_EXPENSIVE: 7_000,
};

const CATEGORY_RULES: { types: string[]; category: ActivityCategory; styles: TravelStyle[] }[] = [
  { types: ["beach"], category: "beach", styles: ["beaches"] },
  { types: ["night_club", "bar"], category: "nightlife", styles: ["nightlife"] },
  { types: ["shopping_mall", "market", "store", "clothing_store"], category: "shopping", styles: ["shopping"] },
  {
    types: ["amusement_park", "hiking_area", "water_park", "zoo", "adventure_sports_center"],
    category: "adventure",
    styles: ["adventure"],
  },
  { types: ["spa"], category: "relaxation", styles: ["relaxation"] },
  { types: ["park", "national_park", "natural_feature"], category: "relaxation", styles: ["nature", "relaxation"] },
  {
    types: [
      "tourist_attraction",
      "museum",
      "art_gallery",
      "historical_landmark",
      "church",
      "hindu_temple",
      "buddhist_temple",
      "mosque",
      "synagogue",
      "history_museum",
    ],
    category: "culture",
    styles: ["culture"],
  },
  { types: ["restaurant", "cafe", "bakery", "food"], category: "food", styles: ["food"] },
];

function inferCategoryAndStyles(
  types: string[] | undefined,
  searchType: PlaceType,
): { category: ActivityCategory; styleTags: TravelStyle[] } {
  for (const rule of CATEGORY_RULES) {
    if (types?.some((t) => rule.types.includes(t))) {
      return { category: rule.category, styleTags: rule.styles };
    }
  }
  const fallback: Record<PlaceType, ActivityCategory> = {
    attraction: "sightseeing",
    restaurant: "food",
    nightlife: "nightlife",
    hotel: "sightseeing",
  };
  return { category: fallback[searchType], styleTags: [] };
}

function inferRating(raw: GoogleRawPlace): Rating | null {
  if (typeof raw.rating !== "number") return null;
  return { value: raw.rating, count: raw.userRatingCount ?? null };
}

function inferPrice(
  raw: GoogleRawPlace,
  currency: string,
  multiplier = 1,
): { amount: number; currency: string; isEstimate: true } | null {
  if (!raw.priceLevel || !(raw.priceLevel in PRICE_LEVEL_TO_INR)) return null;
  return { amount: fromInr(PRICE_LEVEL_TO_INR[raw.priceLevel] * multiplier, currency), currency, isEstimate: true };
}

function buildQuery(params: PlaceSearchParams): string {
  const place = params.country ? `${params.destination}, ${params.country}` : params.destination;
  switch (params.type) {
    case "hotel":
      return `hotels in ${place}`;
    case "restaurant":
      return params.mealType ? `best ${params.mealType} restaurants in ${place}` : `best restaurants in ${place}`;
    case "nightlife":
      return `popular nightlife and bars in ${place}`;
    case "attraction":
    default: {
      const style = params.preferences?.[0];
      return style ? `top ${style} attractions in ${place}` : `top tourist attractions in ${place}`;
    }
  }
}

export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google" as const;

  constructor(private readonly apiKey: string) {}

  async searchPlaces(params: PlaceSearchParams): Promise<Place[]> {
    try {
      const response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: buildQuery(params),
          maxResultCount: Math.min(params.limit ?? 10, 20),
        }),
      });

      if (!response.ok) {
        console.error(`Google Places search failed (${response.status})`, await response.text().catch(() => ""));
        return [];
      }

      const json: unknown = await response.json();
      const parsed = googleTextSearchResponseSchema.safeParse(json);
      if (!parsed.success) {
        console.error("Google Places response failed validation", parsed.error);
        return [];
      }

      const currency = params.currency ?? "INR";
      const hotelPriceMultiplier = params.type === "hotel" ? 3 : 1;

      return (parsed.data.places ?? [])
        .filter((raw): raw is GoogleRawPlace & { displayName: { text: string } } => Boolean(raw.displayName?.text))
        .map((raw) => this.mapPlace(raw, params.type, currency, hotelPriceMultiplier, params.mealType))
        .slice(0, params.limit ?? 10);
    } catch (error) {
      console.error("Google Places request failed", error);
      return [];
    }
  }

  private mapPlace(
    raw: GoogleRawPlace,
    type: PlaceType,
    currency: string,
    priceMultiplier: number,
    mealType: PlaceSearchParams["mealType"],
  ): Place {
    const { category, styleTags } = inferCategoryAndStyles(raw.types, type);
    return {
      id: `google:${raw.id ?? raw.displayName!.text}`,
      type,
      name: raw.displayName!.text,
      description: raw.editorialSummary?.text ?? "",
      category,
      styleTags,
      location: raw.location ? { lat: raw.location.latitude, lng: raw.location.longitude } : null,
      address: raw.formattedAddress ?? null,
      imageUrl: raw.photos?.[0] ? `/api/places/photo?name=${encodeURIComponent(raw.photos[0].name)}` : null,
      rating: inferRating(raw),
      price: inferPrice(raw, currency, priceMultiplier),
      durationMinutes: null,
      mealTypes: type === "restaurant" && mealType ? [mealType] : null,
      source: {
        provider: "google",
        sourceUrl: raw.googleMapsUri ?? raw.websiteUri ?? null,
        sourceName: raw.googleMapsUri ? "Google Maps" : raw.websiteUri ? "Official website" : null,
      },
      isDemoData: false,
    };
  }
}
