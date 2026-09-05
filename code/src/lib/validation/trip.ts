import { z } from "zod";
import { latLngSchema, ratingSchema, sourceRefSchema } from "@/lib/validation/places";
import { travelStyleSchema } from "@/lib/validation/shared";

export { travelStyleSchema };

/**
 * Zod schemas mirror the types in `@/types`. The itinerary generator's output
 * is validated against `generatedItinerarySchema` before it ever reaches the
 * client or Firestore — a malformed AI/mock response should fail loudly in
 * the API route rather than silently corrupting a saved trip.
 */

export const travelerTypeSchema = z.enum(["solo", "couple", "family", "friends", "custom"]);

export const tripDraftInputSchema = z.object({
  destination: z.string().trim().min(2).max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: z.number().positive().max(100_000_000),
  currency: z.enum(["INR", "USD", "EUR", "GBP"]),
  travelers: z.number().int().min(1).max(20),
  travelerType: travelerTypeSchema,
  preferences: z.array(travelStyleSchema).min(1).max(8),
});

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

/** Optional, additive place-provenance fields shared by activities and hotels (Iteration 2). */
const placeProvenanceFields = {
  location: latLngSchema.nullable().optional(),
  rating: ratingSchema.nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  source: sourceRefSchema.nullable().optional(),
  priceIsEstimate: z.boolean().optional(),
};

export const activitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: activityCategorySchema,
  time: z.string(),
  durationMinutes: z.number().nonnegative(),
  description: z.string(),
  estimatedCost: z.number().nonnegative(),
  currency: z.string(),
  referenceUrl: z.string().url().nullable(),
  isDemoData: z.boolean(),
  ...placeProvenanceFields,
});

export const hotelSchema = z.object({
  name: z.string().min(1),
  pricePerNight: z.number().nonnegative(),
  currency: z.string(),
  nights: z.number().nonnegative(),
  referenceUrl: z.string().url().nullable(),
  isDemoData: z.boolean(),
  ...placeProvenanceFields,
});

export const citySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  country: z.string(),
  order: z.number().int(),
  startDate: z.string(),
  endDate: z.string(),
  dayCount: z.number().int().positive(),
  hotel: hotelSchema,
  imageQuery: z.string(),
});

export const tripDaySchema = z.object({
  id: z.string(),
  dayNumber: z.number().int().positive(),
  date: z.string(),
  cityId: z.string(),
  activities: z.array(activitySchema),
});

const budgetCategorySchema = z.enum([
  "flights",
  "hotels",
  "food",
  "activities",
  "transport",
  "shopping",
  "misc",
  "buffer",
]);

export const budgetBreakdownSchema = z.object({
  currency: z.string(),
  total: z.number().nonnegative(),
  estimatedTotal: z.number().nonnegative(),
  categories: z.record(budgetCategorySchema, z.number().nonnegative()),
});

export const generatedItinerarySchema = z.object({
  destination: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  dayCount: z.number().int().positive(),
  currency: z.string(),
  cities: z.array(citySchema).min(1),
  days: z.array(tripDaySchema).min(1),
  budget: budgetBreakdownSchema,
});

export type TripDraftInputParsed = z.infer<typeof tripDraftInputSchema>;
