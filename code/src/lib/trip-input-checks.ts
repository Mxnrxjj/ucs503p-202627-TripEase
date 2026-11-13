import { dayCountInclusive, parseDateInput } from "@/lib/date";
import { fromInr, toInr } from "@/lib/fx";
import { formatMoney } from "@/lib/utils";

/**
 * The checks a new trip's dates and budget must pass, with the message to show
 * when they don't. The wizard, the landing form and the server all use these,
 * so what blocks the Next button, what the traveller is told, and what the API
 * accepts can't drift apart.
 */

/** The smallest budget a new trip can have, in rupees. Other currencies use the equivalent. */
export const MIN_BUDGET_INR = 5_000;

/** The largest budget the API accepts, in the trip's own currency. */
export const MAX_BUDGET = 100_000_000;

/**
 * The longest trip, in days. The trip agent already refuses to grow a trip past
 * this, so a trip made longer could be built but never edited. It also keeps a
 * saved trip well inside Firestore's 1 MiB document limit.
 */
export const MAX_TRIP_DAYS = 30;

/**
 * The minimum budget in `currency`: the smallest whole amount worth at least
 * `MIN_BUDGET_INR` by the app's own rates. `fromInr` alone rounds to the
 * nearest unit, which can land just under (`$60` is ₹4,980), so it is stepped
 * up until the rupee equivalent the wizard shows is really enough.
 */
export function minBudgetIn(currency: string): number {
  let amount = Math.max(1, fromInr(MIN_BUDGET_INR, currency));
  while (toInr(amount, currency) < MIN_BUDGET_INR) amount += 1;
  return amount;
}

/** What is wrong with a budget, or null when it is fine. Takes the raw field text or a number. */
export function budgetProblem(budget: string | number, currency: string): string | null {
  if (typeof budget === "string" && budget.trim() === "") return "Enter your total budget.";
  const amount = typeof budget === "number" ? budget : Number(budget);
  if (!Number.isFinite(amount)) return "Enter the budget as a number.";
  const min = minBudgetIn(currency);
  if (amount < min) return `The budget must be at least ${formatMoney(min, currency)}.`;
  if (amount > MAX_BUDGET) return `The budget can be at most ${formatMoney(MAX_BUDGET, currency)}.`;
  return null;
}

/**
 * Today as `YYYY-MM-DD` in the traveller's own time zone. Not `toISOString`,
 * which gives the UTC date: in the evening in the Americas that is already
 * tomorrow, and today's date would be called "in the past".
 */
export function todayInputValue(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A `YYYY-MM-DD` that is a real calendar day (`2027-02-30` is not). */
export function isRealDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * Why a trip between these two days is too long, or null. Says nothing about
 * dates that are missing, impossible or the wrong way round: those have their
 * own messages, and this only judges a range that is otherwise sound.
 */
export function tripLengthProblem(startDate: string, endDate: string): string | null {
  if (!isRealDay(startDate) || !isRealDay(endDate) || endDate < startDate) return null;
  const days = dayCountInclusive(parseDateInput(startDate), parseDateInput(endDate));
  if (days <= MAX_TRIP_DAYS) return null;
  return `A trip can be at most ${MAX_TRIP_DAYS} days long. This one is ${days}.`;
}

export interface DateProblems {
  start?: string;
  end?: string;
}

/** What is wrong with a trip's dates, per field. Empty when both are fine. */
export function dateProblems(startDate: string, endDate: string, today: string): DateProblems {
  const problems: DateProblems = {};
  const startOk = isRealDay(startDate);
  if (!startOk) problems.start = "Choose a start date.";
  else if (startDate < today) problems.start = "The start date can't be in the past.";

  if (!isRealDay(endDate)) problems.end = "Choose an end date.";
  else if (startOk && endDate < startDate) problems.end = "The end date can't be before the start date.";
  else if (startOk) problems.end = tripLengthProblem(startDate, endDate) ?? undefined;
  return problems;
}

export function datesAreValid(startDate: string, endDate: string, today: string): boolean {
  const problems = dateProblems(startDate, endDate, today);
  return !problems.start && !problems.end;
}
