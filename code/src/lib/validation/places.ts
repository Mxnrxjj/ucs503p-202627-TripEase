import { z } from "zod";
import { travelStyleSchema } from "@/lib/validation/shared";

/**
 * Two layers of validation live here:
 *
 * 1. `placeSchema` validates OUR OWN normalized `Place` shape — every
 *    provider's output is checked against it before it reaches the
 *    itinerary generator, so a bug in a provider mapper fails loudly
 *    instead of writing malformed data into a trip.
 * 2. `googleTextSearchResponseSchema` (and friends) validate the RAW,
 *    untrusted JSON that comes back from the Google Places API before the
 *    google provider is allowed to read a single field off it — an
 *    external API response is exactly the kind of boundary Zod is for.
 */

const placeTypeSchema = z.enum(["attraction", "restaurant", "hotel", "nightlife"]);

const activityCategorySchema = z.enum([
  "sightseeing",
  "food",
  "adventure",
  "beach",
  "culture",
  "relaxation",
  "shopping",
  "nightlife",
  "transport",
]);

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const ratingSchema = z.object({
  value: z.number().min(0).max(5),
  count: z.number().int().nonnegative().nullable(),
});

export const priceInfoSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string(),
  isEstimate: z.boolean(),
});

export const sourceRefSchema = z.object({
  provider: z.enum(["mock", "google"]),
  // Optional so itineraries saved before Iteration 3 still validate.
  providerPlaceId: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable(),
  sourceName: z.string().nullable(),
});

export const placeSchema = z.object({
  id: z.string().min(1),
  type: placeTypeSchema,
  name: z.string().min(1),
  description: z.string(),
  category: activityCategorySchema,
  styleTags: z.array(travelStyleSchema),
  location: latLngSchema.nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  imageUrl: z.string().nullable(),
  rating: ratingSchema.nullable(),
  price: priceInfoSchema.nullable(),
  durationMinutes: z.number().nonnegative().nullable(),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).nullable(),
  source: sourceRefSchema,
  isDemoData: z.boolean(),
});

/** What the client may ask `/api/places/search` for. */
export const placeSearchRequestSchema = z.object({
  query: z.string().trim().min(2).max(120),
  destination: z.string().trim().min(1).max(120),
  country: z.string().trim().max(120).optional(),
  type: placeTypeSchema.default("attraction"),
  currency: z.string().trim().min(3).max(3).default("INR"),
  limit: z.number().int().min(1).max(10).default(6),
});

/**
 * A deliberately loose, defensive schema for the Places API (New)
 * `searchText` response — we only assert the handful of fields the google
 * provider actually reads, and let everything else pass through
 * unvalidated via `.passthrough()`. Any place missing what we need is
 * dropped rather than failing the whole search.
 */
const googleRawPlaceSchema = z
  .object({
    id: z.string().optional(),
    displayName: z.object({ text: z.string() }).optional(),
    formattedAddress: z.string().optional(),
    addressComponents: z
      .array(
        z
          .object({
            longText: z.string().optional(),
            shortText: z.string().optional(),
            types: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
    location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
    rating: z.number().optional(),
    userRatingCount: z.number().optional(),
    priceLevel: z.string().optional(),
    googleMapsUri: z.string().optional(),
    websiteUri: z.string().optional(),
    editorialSummary: z.object({ text: z.string() }).optional(),
    types: z.array(z.string()).optional(),
    photos: z.array(z.object({ name: z.string() })).optional(),
  })
  .passthrough();

export const googleTextSearchResponseSchema = z
  .object({
    places: z.array(googleRawPlaceSchema).optional(),
  })
  .passthrough();

/** The details endpoint returns a single place object rather than a `places` array. */
export const googlePlaceDetailsSchema = googleRawPlaceSchema;

export type GoogleRawPlace = z.infer<typeof googleRawPlaceSchema>;
