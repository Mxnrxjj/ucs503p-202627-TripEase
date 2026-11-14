/**
 * What eating out typically costs in each country TripEase plans trips to.
 * This is the data behind the price of every restaurant, bar and other place
 * Google gives a price level for; the rules that use it are in `./prices.ts`.
 *
 * Two readings per country, both in US dollars for ONE person:
 *  - `inexpensive`: a meal at an inexpensive restaurant.
 *  - `midForTwo`: a three-course meal for TWO at a mid-range restaurant,
 *    without drinks (so one person's share is half of it).
 *
 * Sources (see `SPEND_SOURCES`):
 *  - "numbeo-inexpensive": Numbeo's "Meal at an Inexpensive Restaurant" for 98
 *    countries, accessed by Numbeo on 24 August 2026, as published in full by
 *    Visual Capitalist and republished by ZeroHedge. Read 15 November 2026.
 *  - "numbeo-mid": Numbeo's country ranking for "Meal for Two at a Mid-Range
 *    Restaurant (Three Courses, Without Drinks)". Read 15 November 2026.
 *  - Three countries are in neither Numbeo table and come from a secondary
 *    page that quotes Numbeo-style figures. They are marked "low".
 *  - Bhutan has no figures anywhere usable, so it is priced from its region
 *    (see `./prices.ts`).
 *
 * Numbeo's figures are what residents report paying. Restaurants in tourist
 * areas often charge more, so these are a floor for a traveller's meal rather
 * than a typical bill, and the app always shows them as estimates. Nothing here
 * is a live price.
 */

export type SpendSource = "numbeo-inexpensive" | "numbeo-mid" | "bearsavings" | "westernunion-numbeo";

/** Where each source's figures come from, so a number can be checked. */
export const SPEND_SOURCES: Record<SpendSource, string> = {
  "numbeo-inexpensive":
    "Numbeo 'Meal at an Inexpensive Restaurant', 98 countries, accessed 24 Aug 2026 (visualcapitalist.com, republished at zerohedge.com/personal-finance/switzerland-still-most-expensive-place-world-eat-out)",
  "numbeo-mid":
    "Numbeo 'Meal for Two at a Mid-Range Restaurant (Three Courses, Without Drinks)', country ranking (numbeo.com/cost-of-living/country_price_rankings?itemId=2), read 15 Nov 2026",
  bearsavings: "BearSavings country cost-of-living pages, 'Basic Restaurant Meal' and 'Three-Course Dinner for Two' (bearsavings.com/cost-of-living/<country>/)",
  "westernunion-numbeo":
    "Western Union, 'The cost of living in Iceland vs the United States', quoting Numbeo (westernunion.com/blog/en/us/the-cost-of-living-in-iceland-vs-the-united-states/)",
};

/** Rupees to the US dollar used to convert the figures: the RBI reference rate on 13 November 2026, as for hotel prices. */
export const USD_TO_INR = 94.2;

export interface CountryMealPrices {
  /** US dollars, one person, a meal at an inexpensive restaurant. */
  inexpensive: number;
  /** US dollars, two people, a three-course meal at a mid-range restaurant, no drinks. */
  midForTwo: number;
  sources: SpendSource[];
  /** "medium": both figures from Numbeo's own tables. "low": a secondary page. */
  confidence: "medium" | "low";
}

const numbeo = (inexpensive: number, midForTwo: number): CountryMealPrices => ({
  inexpensive,
  midForTwo,
  sources: ["numbeo-inexpensive", "numbeo-mid"],
  confidence: "medium",
});

const secondary = (inexpensive: number, midForTwo: number, source: SpendSource): CountryMealPrices => ({
  inexpensive,
  midForTwo,
  sources: [source],
  confidence: "low",
});

/** By ISO 3166-1 alpha-2 code. A supported country missing here is priced from its region. */
export const MEAL_PRICES: Readonly<Record<string, CountryMealPrices>> = {
  TH: numbeo(3.06, 23.53),
  AE: numbeo(9.26, 54.45),
  SG: numbeo(11.82, 72.61),
  ID: numbeo(1.7, 15.34),
  MV: secondary(5.98, 48.51, "bearsavings"),
  MY: numbeo(3.71, 21.45),
  VN: numbeo(1.91, 23.36),
  LK: numbeo(2.88, 19.78),
  JP: numbeo(6.29, 39.04),
  IN: numbeo(2.09, 14.33),
  NP: numbeo(1.96, 18.67),
  // BT (Bhutan): no usable figures; priced from South Asia.
  KR: numbeo(7.21, 36.08),
  KH: secondary(3.0, 27.5, "bearsavings"),
  PH: numbeo(4.05, 20.53),
  TR: numbeo(9.36, 30.2),
  OM: numbeo(5.2, 25.98),
  JO: numbeo(5.64, 42.33),
  GE: numbeo(10.56, 37.04),
  FR: numbeo(17.52, 65.15),
  IT: numbeo(20.19, 65.15),
  ES: numbeo(17.52, 54.29),
  CH: numbeo(31.2, 124.86),
  GB: numbeo(21.82, 77.18),
  GR: numbeo(17.52, 54.29),
  DE: numbeo(17.52, 65.15),
  NL: numbeo(23.36, 76.01),
  PT: numbeo(14.01, 43.43),
  AT: numbeo(18.68, 71.67),
  HR: numbeo(14.01, 57.78),
  CZ: numbeo(9.69, 42.8),
  IS: secondary(26.48, 119.46, "westernunion-numbeo"),
  NO: numbeo(23.6, 90.74),
  MU: numbeo(6.44, 34.19),
  EG: numbeo(3.93, 16.55),
  MA: numbeo(4.33, 25.42),
  ZA: numbeo(11.24, 38.2),
  KE: numbeo(3.86, 30.78),
  US: numbeo(20.0, 75.0),
  CA: numbeo(18.11, 72.39),
  MX: numbeo(11.83, 40.71),
  BR: numbeo(6.42, 26.57),
  PE: numbeo(3.58, 26.73),
  AU: numbeo(17.91, 78.63),
  NZ: numbeo(14.93, 70.67),
};
