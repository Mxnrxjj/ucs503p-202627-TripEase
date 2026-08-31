import type { ExpenseCategory } from "@/types/trip";

export const COLLECTIONS = {
  users: "users",
  trips: "trips",
  itineraryItems: (tripId: string) => `trips/${tripId}/itineraryItems`,
  expenses: (tripId: string) => `trips/${tripId}/expenses`,
};

/**
 * Fixed rather than user-defined: keeps the schema stable, makes
 * cross-trip comparison possible later, and removes a setup step
 * from a first-time user. See report section "Budget Model".
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "accommodation",
  "transport",
  "food",
  "activities",
  "misc",
];
