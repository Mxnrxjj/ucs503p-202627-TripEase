import { z } from "zod";

/**
 * The schema boundary for anything a language model returns. The model is
 * asked for JSON, but "asked" is not "guaranteed" — so its output is parsed
 * here before a single field is read, and then handed to the deterministic
 * checks in `services/planning/validate.ts` which enforce the things a schema
 * can't express (days summing to the trip length, no duplicate cities…).
 */

export const cityAllocationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  days: z.number().int().positive().max(60),
  reason: z.string().trim().max(200).default(""),
});

/** What we accept back from the model. Deliberately narrow. */
export const llmCityPlanSchema = z.object({
  destination: z.string().trim().min(1).max(120),
  cities: z.array(cityAllocationSchema).min(1).max(12),
});

export const planningSourceSchema = z.enum(["ai", "fallback"]);

/** Persisted planning metadata on a trip. Optional so pre-Iteration-4 trips still load. */
export const cityPlanSchema = z.object({
  destination: z.string(),
  cities: z.array(cityAllocationSchema),
  source: planningSourceSchema,
  plannerVersion: z.string(),
  fallbackReason: z.string().nullable().optional(),
});

export type LlmCityPlan = z.infer<typeof llmCityPlanSchema>;
