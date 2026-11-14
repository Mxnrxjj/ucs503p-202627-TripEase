import { countryByCode, normalise, resolveCountry, type Region } from "@/lib/countries";
import { CITY_KIND_ALIASES, CITY_KINDS, HOTEL_RATES, type CityKind, type CityRates } from "@/lib/hotels/rate-data";

/**
 * What a night in a hotel costs, as an estimate.
 *
 * Google tells us which hotels exist and how they are rated, but not what they
 * charge or how many stars they have. So the price comes from researched
 * averages (`./rate-data.ts`), and the trip's budget decides which class of
 * hotel to look for:
 *
 *  1. Find the typical 3, 4 and 5-star prices for the city. A city with no
 *     figures of its own is its country's main city scaled for the kind of
 *     place it is (a beach town runs dearer than an ordinary city, see
 *     `KIND_RATIOS`). Failing that, the country's main city as it is, then the
 *     median of its region, then the median of everywhere. The label says
 *     which, so a guess is never shown as a reading.
 *  2. Add tax where it is known to be left out (India's GST).
 *  3. Choose the dearest class that fits what one room may cost a night. When
 *     even 3-star doesn't fit, 3-star is used and the budget shows as tight.
 */

export type HotelTier = "budget" | "mid" | "upscale";

export const HOTEL_TIERS: readonly HotelTier[] = ["budget", "mid", "upscale"];

/** One class cheaper or dearer, and no further than the ends of the range. */
export function shiftTier(tier: HotelTier, direction: "lower" | "higher"): HotelTier {
  const at = HOTEL_TIERS.indexOf(tier) + (direction === "lower" ? -1 : 1);
  return HOTEL_TIERS[Math.min(HOTEL_TIERS.length - 1, Math.max(0, at))];
}

export const TIER_STARS: Record<HotelTier, 3 | 4 | 5> = { budget: 3, mid: 4, upscale: 5 };

/**
 * How close the figure is to the place it is used for: the city's own,
 * modelled from its country's main city, its country's main city as it is,
 * its region's median, or everywhere's median.
 */
export type RateBasis = "city" | "modelled" | "country" | "region" | "world";

/** Saved with a hotel, so the price can say where it came from. */
export interface HotelRateBasis {
  tier: HotelTier;
  basis: RateBasis;
  /** The city or region the figure is for. Empty for a worldwide figure. */
  from: string;
  /** True when the price includes a tax the source left out (India's GST). */
  includesTax: boolean;
  /** For a modelled figure only: the kind of place it was scaled for. */
  kind?: CityKind;
  /** Set when this class's price was worked out from the city's 4-star price, not read off a source. */
  derived?: true;
}

export interface HotelRate extends HotelRateBasis {
  /** Rupees for one room for one night, tax included where `includesTax`. */
  perNightInr: number;
  confidence: "medium" | "low";
}

type TierPrices = Record<HotelTier, number>;

interface RatesLookup {
  prices: TierPrices;
  basis: RateBasis;
  from: string;
  countryCode: string | null;
  confidence: "medium" | "low";
  kind?: CityKind;
  /** The classes of this city's own row that were worked out, not read. */
  derivedTiers: HotelTier[];
}

/** Safari camps with every meal included: real, but not a typical hotel night, so left out of averages. */
const NOT_TYPICAL = new Set(["Masai Mara"]);

const pricesOf = (row: CityRates): TierPrices => ({ budget: row.star3, mid: row.star4, upscale: row.star5 });

const ALL_ROWS: { code: string; row: CityRates }[] = Object.entries(HOTEL_RATES).flatMap(([code, rows]) =>
  rows.map((row) => ({ code, row })),
);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Each class's median on its own, over typical rows only, in whole rupees. */
function medianPrices(rows: CityRates[]): TierPrices {
  const typical = rows.filter((row) => !NOT_TYPICAL.has(row.city));
  return {
    budget: Math.round(median(typical.map((row) => row.star3))),
    mid: Math.round(median(typical.map((row) => row.star4))),
    upscale: Math.round(median(typical.map((row) => row.star5))),
  };
}

/** A country's main city: the first ordinary row (see `./rate-data.ts`). */
const mainRow = (code: string): CityRates | null =>
  (HOTEL_RATES[code] ?? []).find((row) => !NOT_TYPICAL.has(row.city)) ?? null;

/** The kind of place `keys` names in a country, if `CITY_KINDS` says. */
function kindOf(code: string, keys: string[]): CityKind | null {
  const kinds = CITY_KINDS[code] ?? {};
  const aliases = CITY_KIND_ALIASES[code] ?? {};
  const name = Object.keys(kinds).find((city) =>
    [city, ...(aliases[city] ?? [])].some((spelling) => keys.includes(normalise(spelling))),
  );
  return name ? kinds[name] : null;
}

/**
 * How dear each kind of place runs against its country's main city: the
 * median, over every city with figures of its own and a kind, of its 4-star
 * price over its main city's 4-star price. One ratio scales all three
 * classes, so a modelled city keeps its main city's spread between classes.
 */
export const KIND_RATIOS: ReadonlyMap<CityKind, { ratio: number; pairs: number }> = (() => {
  const byKind = new Map<CityKind, number[]>();
  for (const [code, rows] of Object.entries(HOTEL_RATES)) {
    const main = mainRow(code);
    if (!main) continue;
    for (const row of rows) {
      if (row === main || NOT_TYPICAL.has(row.city)) continue;
      const kind = CITY_KINDS[code]?.[row.city];
      if (!kind) continue;
      byKind.set(kind, [...(byKind.get(kind) ?? []), row.star4 / main.star4]);
    }
  }
  return new Map([...byKind].map(([kind, ratios]) => [kind, { ratio: Math.round(median(ratios) * 100) / 100, pairs: ratios.length }]));
})();

const scaled = (row: CityRates, ratio: number): TierPrices => ({
  budget: Math.round((row.star3 * ratio) / 100) * 100,
  mid: Math.round((row.star4 * ratio) / 100) * 100,
  upscale: Math.round((row.star5 * ratio) / 100) * 100,
});

const regionOf = (code: string): Region | null => countryByCode(code)?.region ?? null;

const REGION_PRICES = new Map<Region, TierPrices>();
for (const region of new Set(ALL_ROWS.map(({ code }) => regionOf(code)).filter((r): r is Region => r !== null))) {
  REGION_PRICES.set(region, medianPrices(ALL_ROWS.filter(({ code }) => regionOf(code) === region).map(({ row }) => row)));
}

const WORLD_PRICES = medianPrices(ALL_ROWS.map(({ row }) => row));

/** "Delhi", "New Delhi" and "Delhi, India" are all Delhi. */
function cityKeys(city: string): string[] {
  const whole = normalise(city);
  const first = normalise(city.split(",")[0] ?? "");
  return [...new Set([whole, first].filter(Boolean))];
}

function rowMatches(row: CityRates, keys: string[]): boolean {
  return [row.city, ...row.aliases].some((name) => keys.includes(normalise(name)));
}

/** The typical prices for a city, from the closest figures there are. */
export function lookupCityRates(city: string, destination: string): RatesLookup {
  const keys = cityKeys(city);
  const country = resolveCountry(destination);

  if (country) {
    const rows = HOTEL_RATES[country.code] ?? [];
    const own = rows.find((row) => rowMatches(row, keys));
    if (own) {
      return {
        prices: pricesOf(own),
        basis: "city",
        from: own.city,
        countryCode: country.code,
        confidence: own.confidence,
        derivedTiers: own.derivedTiers,
      };
    }
    const main = mainRow(country.code);
    const kind = main ? kindOf(country.code, keys) : null;
    const ratio = kind ? KIND_RATIOS.get(kind)?.ratio : undefined;
    if (main && kind && ratio) {
      return {
        prices: scaled(main, ratio),
        basis: "modelled",
        from: main.city,
        countryCode: country.code,
        confidence: "low",
        kind,
        derivedTiers: [],
      };
    }
    if (main) {
      return {
        prices: pricesOf(main),
        basis: "country",
        from: main.city,
        countryCode: country.code,
        confidence: "low",
        derivedTiers: [],
      };
    }
    const regional = REGION_PRICES.get(country.region);
    if (regional) {
      return {
        prices: regional,
        basis: "region",
        from: country.region,
        countryCode: country.code,
        confidence: "low",
        derivedTiers: [],
      };
    }
    return { prices: WORLD_PRICES, basis: "world", from: "", countryCode: country.code, confidence: "low", derivedTiers: [] };
  }

  // A trip saved before destinations were limited to the supported countries
  // ("Somewhere, Atlantis"): the city may still be one we know.
  const known = ALL_ROWS.find(({ row }) => rowMatches(row, keys));
  if (known) {
    return {
      prices: pricesOf(known.row),
      basis: "city",
      from: known.row.city,
      countryCode: known.code,
      confidence: known.row.confidence,
      derivedTiers: known.row.derivedTiers,
    };
  }
  return { prices: WORLD_PRICES, basis: "world", from: "", countryCode: null, confidence: "low", derivedTiers: [] };
}

/**
 * India's GST on a hotel room, from 22 September 2025: 5% when the room costs
 * ₹7,500 a night or less, 18% above that. The slab is set by the price of the
 * room before tax. Indian booking sites show it on top of the room price, and
 * the figures here are before it, so it is added.
 */
export function withLocalTax(perNightInr: number, countryCode: string | null): number {
  if (countryCode !== "IN") return perNightInr;
  return Math.round(perNightInr * (perNightInr <= 7_500 ? 1.05 : 1.18));
}

/**
 * The dearest class whose price fits what one room may cost a night. When
 * there is no limit (no budget given), 4-star. When nothing fits, 3-star: the
 * cheapest class there are figures for, so the budget will show as tight.
 */
export function chooseTier(prices: TierPrices, maxPerNightInr: number | null): HotelTier {
  if (maxPerNightInr === null || !Number.isFinite(maxPerNightInr)) return "mid";
  for (const tier of [...HOTEL_TIERS].reverse()) {
    if (prices[tier] <= maxPerNightInr) return tier;
  }
  return "budget";
}

/**
 * The estimated price of a night in `city`, and the class of hotel it is for.
 * `tier` fixes the class (when a traveller swaps one hotel for another, the new
 * one is priced as the same class); otherwise the budget chooses it.
 */
export function hotelRate(args: {
  city: string;
  destination: string;
  maxPerNightInr: number | null;
  tier?: HotelTier;
}): HotelRate {
  const lookup = lookupCityRates(args.city, args.destination);
  const taxed: TierPrices = {
    budget: withLocalTax(lookup.prices.budget, lookup.countryCode),
    mid: withLocalTax(lookup.prices.mid, lookup.countryCode),
    upscale: withLocalTax(lookup.prices.upscale, lookup.countryCode),
  };
  const tier = args.tier ?? chooseTier(taxed, args.maxPerNightInr);
  return {
    tier,
    basis: lookup.basis,
    from: lookup.from,
    includesTax: lookup.countryCode === "IN",
    perNightInr: taxed[tier],
    confidence: lookup.confidence,
    // Only when there is one: a saved trip can't hold an undefined field.
    ...(lookup.kind ? { kind: lookup.kind } : {}),
    ...(lookup.derivedTiers.includes(tier) ? { derived: true as const } : {}),
  };
}

/**
 * What is saved with a hotel: the rate without its price and confidence. Built
 * from the rate, field by field, so a new field can't be left out in one place.
 * Keys that don't apply are left out, never set to undefined: Firestore
 * refuses to save an undefined field.
 */
export function rateBasisOf(rate: HotelRate): HotelRateBasis {
  return {
    tier: rate.tier,
    basis: rate.basis,
    from: rate.from,
    includesTax: rate.includesTax,
    ...(rate.kind ? { kind: rate.kind } : {}),
    ...(rate.derived ? { derived: true as const } : {}),
  };
}

const KIND_LABELS: Record<CityKind, string> = {
  city: "a big city",
  heritage: "a heritage town",
  beach: "a beach town",
  nature: "a nature getaway",
};

/** One line saying what a hotel's estimated price is based on. */
export function describeRateBasis(rate: HotelRateBasis): string {
  const stars = `${TIER_STARS[rate.tier]}-star`;
  const tax = rate.includesTax ? ", incl. GST" : "";
  switch (rate.basis) {
    case "city":
      return rate.derived
        ? `Estimated ${stars} price in ${rate.from}, worked out from its 4-star${tax}`
        : `Typical ${stars} price in ${rate.from}${tax}`;
    case "modelled":
      return rate.kind
        ? `Estimated ${stars} price for ${KIND_LABELS[rate.kind]}, from ${rate.from} prices${tax}`
        : `Estimated ${stars} price from ${rate.from} prices${tax}`;
    case "country":
      return `Based on a typical ${stars} in ${rate.from}${tax}`;
    case "region":
      return `Rough ${stars} estimate from ${rate.from} prices${tax}`;
    case "world":
      return `Rough ${stars} estimate${tax}`;
  }
}
