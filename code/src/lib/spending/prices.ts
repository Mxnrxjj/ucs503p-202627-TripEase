import { COUNTRIES, countryByCode, type Region } from "@/lib/countries";
import { MEAL_PRICES, USD_TO_INR, type CountryMealPrices } from "@/lib/spending/price-data";

/**
 * What one person spends at a restaurant, a bar or any other place, by how
 * dear the place is.
 *
 * Google gives a place only a coarse price level (inexpensive, moderate,
 * expensive, very expensive), and that level is relative to the place's own
 * country: a "moderate" restaurant in Jaipur and one in Zurich are worlds
 * apart. So each level is turned into rupees with that country's figures
 * (`./price-data.ts`), not one table for the whole world.
 *
 * The same four levels are also the spending tiers a trip's budget chooses
 * between for its meals and nights out (see `itinerary-generator`):
 *  - budget:  a meal at an inexpensive restaurant (read off the data).
 *  - mid:     one person's half of a mid-range three-course meal for two (read).
 *  - upscale: mid x `UPSCALE_OVER_MID`. A model: published fine-dining and
 *             mid-range estimates for India, the Maldives, Cambodia and Bhutan
 *             put fine dining at 1.8x to 3.3x mid-range.
 *  - luxury:  upscale x `LUXURY_OVER_UPSCALE`, for Google's "very expensive". A model.
 *
 * A country with no figures of its own uses its region's median, and failing
 * that everywhere's median. The result says which.
 */

export type SpendTier = "budget" | "mid" | "upscale" | "luxury";

/** Cheapest first. */
export const SPEND_TIERS: readonly SpendTier[] = ["budget", "mid", "upscale", "luxury"];

export const UPSCALE_OVER_MID = 2.5;
export const LUXURY_OVER_UPSCALE = 2;

/** Google's price levels (Places API, New), and the tier each one is priced as. FREE costs nothing. */
const LEVEL_TIER: Readonly<Record<string, SpendTier>> = {
  PRICE_LEVEL_INEXPENSIVE: "budget",
  PRICE_LEVEL_MODERATE: "mid",
  PRICE_LEVEL_EXPENSIVE: "upscale",
  PRICE_LEVEL_VERY_EXPENSIVE: "luxury",
};

export type SpendBasis = "country" | "region" | "world";

export interface SpendPrices {
  /** Rupees, one person, at a place of each tier. Rounded to ₹10. Cheapest first, never decreasing. */
  perPersonInr: Record<SpendTier, number>;
  basis: SpendBasis;
  /** The country or region the figures are for. Empty for a worldwide figure. */
  from: string;
  confidence: "medium" | "low";
}

const roundTo10 = (inr: number) => Math.max(10, Math.round(inr / 10) * 10);

/** Each tier's price, in rupees, from a country's two dollar figures. */
export function tiersFromUsd(inexpensiveUsd: number, midForTwoUsd: number): Record<SpendTier, number> {
  const budget = inexpensiveUsd * USD_TO_INR;
  // A mid-range meal is never cheaper than an inexpensive one, even where a
  // source's two figures say otherwise.
  const mid = Math.max(budget, (midForTwoUsd / 2) * USD_TO_INR);
  const upscale = mid * UPSCALE_OVER_MID;
  const luxury = upscale * LUXURY_OVER_UPSCALE;
  return { budget: roundTo10(budget), mid: roundTo10(mid), upscale: roundTo10(upscale), luxury: roundTo10(luxury) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianOf(rows: CountryMealPrices[]): Record<SpendTier, number> {
  return tiersFromUsd(median(rows.map((r) => r.inexpensive)), median(rows.map((r) => r.midForTwo)));
}

const ROWS = Object.entries(MEAL_PRICES);

const REGION_TIERS = new Map<Region, Record<SpendTier, number>>();
for (const region of new Set(COUNTRIES.map((c) => c.region))) {
  const rows = ROWS.filter(([code]) => countryByCode(code)?.region === region).map(([, row]) => row);
  if (rows.length > 0) REGION_TIERS.set(region, medianOf(rows));
}

const WORLD_TIERS = medianOf(ROWS.map(([, row]) => row));

/** The per-person prices for places in a country, from the closest figures there are. `countryCode` is ISO alpha-2. */
export function spendPricesFor(countryCode: string | null | undefined): SpendPrices {
  const code = countryCode?.trim().toUpperCase() ?? "";
  // Codes are upper case, so none can name an Object method.
  const own = code ? MEAL_PRICES[code] : undefined;
  const country = code ? countryByCode(code) : null;
  if (own) {
    return {
      perPersonInr: tiersFromUsd(own.inexpensive, own.midForTwo),
      basis: "country",
      from: country?.name ?? code,
      confidence: own.confidence,
    };
  }
  const regional = country ? REGION_TIERS.get(country.region) : undefined;
  if (country && regional) {
    return { perPersonInr: regional, basis: "region", from: country.region, confidence: "low" };
  }
  return { perPersonInr: WORLD_TIERS, basis: "world", from: "", confidence: "low" };
}

/** The tier a Google price level is priced as. Null for FREE and for anything that isn't a known level. */
export function tierOfPriceLevel(level: string | null | undefined): SpendTier | null {
  // Own keys only: a level of "toString" must not find Object's method.
  return level && Object.hasOwn(LEVEL_TIER, level) ? LEVEL_TIER[level] : null;
}

/**
 * Rupees, one person, at a place with this Google price level in this
 * country. 0 for PRICE_LEVEL_FREE; null when the level is missing or unknown,
 * so the caller decides what an unpriced place costs.
 */
export function priceLevelInr(level: string | null | undefined, countryCode: string | null | undefined): number | null {
  if (level === "PRICE_LEVEL_FREE") return 0;
  const tier = tierOfPriceLevel(level);
  return tier ? spendPricesFor(countryCode).perPersonInr[tier] : null;
}

/** What one person's food costs for a day at `tier`: three meals. */
export const MEALS_PER_DAY = 3;

export function dailyFoodInr(tier: SpendTier, prices: SpendPrices): number {
  return MEALS_PER_DAY * prices.perPersonInr[tier];
}
