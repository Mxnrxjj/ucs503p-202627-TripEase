import { planCitiesDeterministically } from "@/lib/services/planning/fallback-planner";
import { llmCityPlanSchema, type LlmCityPlan } from "@/lib/validation/planning";
import type { CityPlanRequest } from "@/types/planning";
import { AIProviderError, type AIProvider } from "./provider";

/**
 * A stand-in AI provider: no network, no key, deterministic output.
 *
 * Two uses. In tests it exercises the full proposal → Zod → constraint →
 * repair → fallback pipeline without a live model. At runtime
 * (`AI_PROVIDER=mock`) it keeps the app fully functional with no credentials.
 *
 * Its proposals come from the deterministic planner, so they're always valid
 * and never invent city names. Because nothing actually *reasoned* about the
 * trip, `simulated` is true and `services/planning` records the resulting
 * plan as `fallback`, not `ai` — a trip should never claim AI planning it
 * didn't get.
 */
export type MockBehaviour = "valid" | "bad-allocation" | "malformed" | "error";

export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model = "mock";
  readonly simulated = true;

  /** How many times `planCities` has been called — lets tests assert retry counts. */
  calls = 0;

  constructor(private readonly behaviour: MockBehaviour = "valid") {}

  async planCities(request: CityPlanRequest, repairNote?: string): Promise<LlmCityPlan> {
    this.calls += 1;

    if (this.behaviour === "error") {
      throw new AIProviderError("quota", "Simulated provider failure.");
    }
    if (this.behaviour === "malformed") {
      throw new AIProviderError("malformed-json", "Simulated malformed response.");
    }

    // Reproduce the realistic failure the pipeline has to survive: a
    // well-formed plan whose days don't add up. The repair round then
    // succeeds, exactly as a real model's correction would.
    if (this.behaviour === "bad-allocation" && !repairNote) {
      const parsed = llmCityPlanSchema.parse({
        destination: request.destination,
        cities: [
          { name: "First City", days: request.dayCount, reason: "Simulated" },
          { name: "Second City", days: 1, reason: "Simulated overflow" },
        ],
      });
      return parsed;
    }

    return llmCityPlanSchema.parse({
      destination: request.destination,
      cities: planCitiesDeterministically(request),
    });
  }
}
