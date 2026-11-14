import { z } from "zod";
import { latLngSchema, ratingSchema, sourceRefSchema } from "@/lib/validation/places";
import { travelStyleSchema } from "@/lib/validation/shared";
import { isSupportedCountry } from "@/lib/countries";
import { isOriginAirport } from "@/lib/flights/airports";
import { FOCUS_MAX_LENGTH, focusProblem } from "@/lib/trip-focus";
import { MAX_BUDGET, budgetProblem, isRealDay, tripLengthProblem } from "@/lib/trip-input-checks";

export { travelStyleSchema };

const quoteDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, { message: "Not a real date." });

/**
 * Zod schemas mirror the types in `@/types`. The itinerary generator's output
 * is validated against `generatedItinerarySchema` before it ever reaches the
 * client or Firestore — a malformed AI response should fail loudly in
 * the API route rather than silently corrupting a saved trip.
 */

export const travelerTypeSchema = z.enum(["solo", "couple", "family", "friends", "custom"]);

/** A place inside the destination country. Empty is allowed and means none. */
const focusSchema = z
  .string()
  .trim()
  .max(FOCUS_MAX_LENGTH)
  .superRefine((value, ctx) => {
    const problem = focusProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const tripDraftInputSchema = z.object({
  destination: z.string().trim().min(2).max(80),
  focus: focusSchema.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: z.number().positive().max(MAX_BUDGET),
  currency: z.enum(["INR", "USD", "EUR", "GBP"]),
  travelers: z.number().int().min(1).max(20),
  travelerType: travelerTypeSchema,
  // Travel style is optional: the wizard lets a traveller skip it, and everything
  // downstream (ranking, prompts, saved trips) already copes with none.
  preferences: z.array(travelStyleSchema).max(8),
  includeFlights: z.boolean().optional(),
  origin: z.string().refine(isOriginAirport, { message: "Choose an airport from the list." }).optional(),
  quotedOn: quoteDaySchema.optional(),
});

/**
 * A trip being created must be to one of the supported countries, exactly as
 * the picker spells it. The picker already guarantees this; checking again here
 * is what makes it a rule and not a suggestion, since a request can be made
 * without the page.
 *
 * Deliberately not applied to `tripDraftInputSchema` itself: that is also what
 * rebuilding a saved trip is checked against, and trips saved before the list
 * existed ("Bali, Indonesia") must keep working.
 */
export const newTripInputSchema = tripDraftInputSchema
  .extend({
    destination: z
      .string()
      .trim()
      .refine(isSupportedCountry, { message: "Choose one of the supported countries." }),
  })
  // The same budget minimum and trip length the wizard asks for. New trips
  // only, like the country rule above: older saved trips (a smaller budget, a
  // longer stay) must still rebuild.
  .superRefine((input, ctx) => {
    const budget = budgetProblem(input.budget, input.currency);
    if (budget) ctx.addIssue({ code: "custom", path: ["budget"], message: budget });

    if (!isRealDay(input.startDate)) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Not a real date." });
    if (!isRealDay(input.endDate)) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Not a real date." });
    const length = tripLengthProblem(input.startDate, input.endDate);
    if (length) ctx.addIssue({ code: "custom", path: ["endDate"], message: length });
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
  address: z.string().nullable().optional(),
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

export const hotelRateBasisSchema = z.object({
  tier: z.enum(["budget", "mid", "upscale"]),
  basis: z.enum(["city", "modelled", "country", "region", "world"]),
  from: z.string().max(80),
  includesTax: z.boolean(),
  kind: z.enum(["city", "heritage", "beach", "nature"]).optional(),
  derived: z.literal(true).optional(),
});

export const hotelSchema = z.object({
  name: z.string().min(1),
  pricePerNight: z.number().nonnegative(),
  currency: z.string(),
  nights: z.number().nonnegative(),
  referenceUrl: z.string().url().nullable(),
  isDemoData: z.boolean(),
  ...placeProvenanceFields,
  rateBasis: hotelRateBasisSchema.optional(),
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

const quotedAirportSchema = z.object({ code: z.string().min(3).max(3), city: z.string().min(1) });

export const flightQuoteSchema = z.object({
  origin: quotedAirportSchema,
  arrival: quotedAirportSchema.nullable(),
  originAssumed: z.boolean(),
  perTravelerInr: z.object({
    low: z.number().nonnegative(),
    typical: z.number().nonnegative(),
    high: z.number().nonnegative(),
  }),
  travelers: z.number().int().positive(),
  totalInr: z.number().nonnegative(),
  quotedOn: quoteDaySchema,
  daysAhead: z.number().int().nonnegative(),
  confidence: z.enum(["route", "modelled"]),
  basis: z.string(),
});

export const generatedItinerarySchema = z.object({
  destination: z.string(),
  focus: z.string().nullable().optional(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  dayCount: z.number().int().positive(),
  currency: z.string(),
  cities: z.array(citySchema).min(1),
  days: z.array(tripDaySchema).min(1),
  budget: budgetBreakdownSchema,
  flights: flightQuoteSchema.nullable().optional(),
});

export type NewTripInputParsed = z.infer<typeof newTripInputSchema>;
export type TripDraftInputParsed = z.infer<typeof tripDraftInputSchema>;
