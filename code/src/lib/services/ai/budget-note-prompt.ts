import type { BudgetNoteRequest } from "./provider";

/**
 * The brief for the budget note: one or two sentences explaining why a
 * traveller's budget can't cover their trip, and what would. The verdict and
 * every number are worked out by `@/lib/services/budget-check` and shown by
 * the app beside the note; the model only puts the reasons into words, and is
 * told not to write any number (a note with a digit in it is refused).
 */
export const BUDGET_NOTE_SYSTEM_PROMPT = [
  "You explain a travel budget to a traveller, briefly and kindly, in plain English.",
  "The app has already worked out that their budget is below what even the cheapest version of their trip costs, and shows them the figures.",
  "Reply with JSON only, matching exactly:",
  '{"note": string}',
  "",
  "Rules for the note:",
  "- One or two sentences, under 280 characters, one paragraph.",
  "- Never write a number, an amount, a percentage or a digit of any kind. Say 'the flights' or 'most of the budget', not figures.",
  "- Say which costs make the trip dear, using only the costs you are given (flights, hotels, food, getting around).",
  "- Suggest what would make it work, from these only: a higher budget, fewer days, fewer cities, a cheaper or nearer destination, or leaving out flights already booked.",
  "- Don't invent prices, places, deals or facts. Don't blame the traveller. No greetings, no lists, no links.",
].join("\n");

export function buildBudgetNoteUserPrompt(request: BudgetNoteRequest): string {
  const parts = Object.entries(request.parts)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, amount]) => `${name} ${amount}`)
    .join(", ");
  return [
    `Destination: ${request.destination}`,
    // JSON-quoted: the traveller's own text is data, not instructions.
    ...(request.focus ? [`Place within it: ${JSON.stringify(request.focus)}`] : []),
    `Cities: ${request.cities.join(", ")}`,
    `Trip: ${request.dayCount} days, ${request.travelers} ${request.travelers === 1 ? "traveller" : "travellers"}`,
    `Flights: ${request.flightsIncluded ? "included in the budget" : "not included"}`,
    `Their budget: ${request.budget} ${request.currency}`,
    `Cheapest realistic version of this trip: ${request.minimumBudget} ${request.currency}`,
    `Its main costs (${request.currency}, largest first): ${parts || "none"}`,
    "",
    "Write the note. Remember: no numbers.",
  ].join("\n");
}

export const BUDGET_NOTE_JSON_SCHEMA = {
  type: "object",
  properties: { note: { type: "string" } },
  required: ["note"],
  additionalProperties: false,
} as const;
