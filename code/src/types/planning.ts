/**
 * The city-allocation layer that sits between "the traveller's intent" and
 * "real places". An AI proposes which cities to visit and for how long;
 * TripEase validates that proposal against the trip's hard constraints; the
 * places provider then supplies real-world facts for whatever survived.
 *
 * Nothing here holds prompts or raw model responses — only the structured
 * decision, so a saved trip stays small and free of model chatter.
 */

export type PlanningSource = "ai" | "fallback";

export interface CityAllocation {
  name: string;
  days: number;
  /** Short, human-readable rationale, shown to the traveller. */
  reason: string;
}

export interface CityPlan {
  destination: string;
  cities: CityAllocation[];
  source: PlanningSource;
  /** Bumped when the planning logic changes, so old trips stay interpretable. */
  plannerVersion: string;
  /** Why the AI plan wasn't used, when it wasn't. Never shown as an error to the traveller. */
  fallbackReason?: string | null;
}

export interface CityPlanRequest {
  destination: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  travelers: number;
  budget: number;
  currency: string;
  preferences: string[];
}
