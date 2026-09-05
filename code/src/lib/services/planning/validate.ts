import type { CityAllocation, CityPlanRequest } from "@/types/planning";

/**
 * TripEase's own checks on a proposed city allocation, run *after* Zod.
 *
 * Zod proves the shape is right; these prove the plan is actually possible:
 * days that sum to the trip, no city visited twice, a sane number of stops.
 * A model that returns four well-formed cities adding up to eleven days for a
 * nine-day trip passes the schema and fails here — which is the entire point.
 * Nothing invalid is ever silently corrected: it either passes, or the caller
 * retries/falls back.
 */

/** More stops than this in one trip stops being a holiday and starts being a bus tour. */
const MAX_CITIES = 8;

export type PlanValidation =
  | { ok: true }
  | { ok: false; problems: string[] };

export function validateCityAllocation(
  cities: CityAllocation[],
  request: Pick<CityPlanRequest, "destination" | "dayCount" | "travelers" | "budget">,
): PlanValidation {
  const problems: string[] = [];

  // Trip-level inputs must themselves be sane before judging the allocation.
  if (!Number.isInteger(request.dayCount) || request.dayCount < 1) {
    problems.push("The trip length is not a valid number of days.");
  }
  if (!Number.isInteger(request.travelers) || request.travelers < 1 || request.travelers > 20) {
    problems.push("The traveller count must be a whole number between 1 and 20.");
  }
  if (!Number.isFinite(request.budget) || request.budget <= 0) {
    problems.push("The budget must be a positive amount.");
  }

  if (!Array.isArray(cities) || cities.length === 0) {
    problems.push("The plan contains no cities.");
    return { ok: false, problems };
  }

  if (cities.length > MAX_CITIES) {
    problems.push(`The plan has ${cities.length} cities; at most ${MAX_CITIES} are allowed.`);
  }
  if (cities.length > request.dayCount) {
    problems.push(`The plan has ${cities.length} cities but only ${request.dayCount} days to spend.`);
  }

  const seen = new Set<string>();
  for (const city of cities) {
    const name = city.name?.trim() ?? "";
    if (!name) {
      problems.push("A city is missing a name.");
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push(`"${name}" appears more than once.`);
    }
    seen.add(key);

    if (!Number.isInteger(city.days) || city.days < 1) {
      problems.push(`"${name}" has an invalid number of days (${city.days}).`);
    } else if (city.days > request.dayCount) {
      problems.push(`"${name}" is allocated ${city.days} days, more than the whole trip.`);
    }
  }

  const total = cities.reduce((sum, c) => sum + (Number.isFinite(c.days) ? c.days : 0), 0);
  if (total !== request.dayCount) {
    problems.push(`City days add up to ${total}, but the trip is ${request.dayCount} days.`);
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

/**
 * A plan is for the destination that was asked for, not a different one.
 * Kept separate from the allocation checks because a model naming the country
 * slightly differently ("Italy" vs "italy", "Japan" vs "Japan 🇯🇵") is a soft
 * mismatch we tolerate, whereas an entirely different country is not.
 */
export function destinationMatches(planned: string, requested: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  const a = normalize(planned);
  const b = normalize(requested);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
