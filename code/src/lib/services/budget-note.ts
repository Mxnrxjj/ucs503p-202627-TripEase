import { AIProviderError, type AIProvider, type BudgetNoteRequest } from "@/lib/services/ai";
import { cleanFocus } from "@/lib/trip-focus";
import type { TripBudgetCheck } from "@/lib/services/budget-check";
import type { BudgetNote } from "@/types/budget";
import type { GeneratedItinerary, TripDraftInput } from "@/types/trip";

/**
 * The model-written half of the budget check (server only).
 *
 * The check itself is deterministic (`@/lib/services/budget-check`): it alone
 * decides whether a budget is too low and works out every figure. When it is,
 * a model is asked for a sentence or two saying why, in words, and what would
 * make the trip work. The note is optional in every way: no model configured,
 * a slow or failed call, or an answer that breaks the rules (any number at
 * all) simply means no note, and the traveller still sees the check's own
 * message. A trip is never held up for more than `BUDGET_NOTE_TIMEOUT_MS`.
 */

export const BUDGET_NOTE_TIMEOUT_MS = 8_000;

export function budgetNoteRequest(
  itinerary: GeneratedItinerary,
  input: Pick<TripDraftInput, "travelers" | "budget" | "includeFlights">,
  check: TripBudgetCheck,
): BudgetNoteRequest {
  return {
    destination: itinerary.destination,
    focus: cleanFocus(itinerary.focus ?? undefined, itinerary.destination),
    cities: itinerary.cities.map((city) => city.name),
    dayCount: itinerary.dayCount,
    travelers: input.travelers,
    flightsIncluded: input.includeFlights !== false,
    currency: itinerary.currency,
    budget: itinerary.budget.total,
    minimumBudget: check.minimum.budget,
    parts: check.minimum.parts,
  };
}

/** The note, or null whenever there isn't a good one in time. Never throws. */
export async function writeBudgetNote(
  provider: AIProvider | null,
  request: BudgetNoteRequest,
  timeoutMs: number = BUDGET_NOTE_TIMEOUT_MS,
): Promise<BudgetNote | null> {
  if (!provider?.explainBudget) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const answer = await Promise.race([provider.explainBudget(request), timedOut]);
    if (!answer) {
      console.warn("[ai] budget note timed out; the trip is saved without one.");
      return null;
    }
    return { text: answer.note, minimumBudget: request.minimumBudget, budget: request.budget, currency: request.currency };
  } catch (error) {
    const code = error instanceof AIProviderError ? error.code : "unexpected";
    console.warn(`[ai] budget note not written (${code}); the trip is saved without one.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
