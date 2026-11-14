export type BudgetCategory =
  | "flights"
  | "hotels"
  | "food"
  | "activities"
  | "transport"
  | "shopping"
  | "misc"
  | "buffer";

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  flights: "Flights",
  hotels: "Hotels",
  food: "Food",
  activities: "Activities",
  transport: "Transport",
  shopping: "Shopping",
  misc: "Miscellaneous",
  buffer: "Emergency buffer",
};

export const BUDGET_CATEGORY_ORDER: BudgetCategory[] = [
  "hotels",
  "flights",
  "food",
  "activities",
  "transport",
  "shopping",
  "misc",
  "buffer",
];

export interface BudgetBreakdown {
  currency: string;
  total: number;
  estimatedTotal: number;
  categories: Record<BudgetCategory, number>;
}

export interface SavingsSuggestion {
  id: string;
  title: string;
  description: string;
  estimatedSavings: number;
  kind: "hotel-downgrade" | "activity-swap" | "food-swap" | "transport-swap";
  targetId?: string;
  /**
   * What to ask Travis to carry this out. A suggestion never edits the trip
   * itself: swapping a hotel or a tour needs a real alternative, which Travis
   * finds through the places provider and the traveller confirms.
   */
  askTravis: string;
}

/**
 * A model's short explanation of why a budget is too low for its trip, saved
 * with the figures it was written for. It is shown only while those still
 * hold: after an edit that changes the minimum or the budget, it is stale and
 * is not shown. It never contains a number; the figures shown beside it come
 * from the budget check.
 */
export interface BudgetNote {
  text: string;
  minimumBudget: number;
  budget: number;
  currency: string;
}
