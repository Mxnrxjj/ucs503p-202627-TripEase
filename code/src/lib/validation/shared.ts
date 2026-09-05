import { z } from "zod";

/**
 * Schemas shared between `trip.ts` and `places.ts`. Kept in their own module
 * with no imports from either so neither of those two files ever has to
 * import from the other — `trip.ts` -> `places.ts` -> `trip.ts` is a runtime
 * circular import (these are real `const` schema objects, not type-only
 * imports) that broke production builds with a
 * "Cannot access '...' before initialization" error, even though it passed
 * `tsc` (which doesn't check module evaluation order).
 */
export const travelStyleSchema = z.enum([
  "beaches",
  "food",
  "culture",
  "adventure",
  "nightlife",
  "shopping",
  "nature",
  "relaxation",
]);
