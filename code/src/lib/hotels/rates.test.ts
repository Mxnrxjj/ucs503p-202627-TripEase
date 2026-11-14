import { describe, expect, it } from "vitest";
import { COUNTRIES, countryByCode, normalise } from "@/lib/countries";
import { CITY_KIND_ALIASES, CITY_KINDS, HOTEL_RATES, RATE_SOURCES, type CityKind } from "@/lib/hotels/rate-data";
import {
  chooseTier,
  describeRateBasis,
  hotelRate,
  KIND_RATIOS,
  lookupCityRates,
  rateBasisOf,
  shiftTier,
  withLocalTax,
} from "@/lib/hotels/rates";

const rows = Object.entries(HOTEL_RATES).flatMap(([code, list]) => list.map((row) => ({ code, row })));

describe("the rate table", () => {
  it("is keyed by supported countries only", () => {
    for (const code of Object.keys(HOTEL_RATES)) expect(countryByCode(code), code).toBeTruthy();
  });

  it("has whole, positive prices that rise with the class", () => {
    for (const { row } of rows) {
      for (const price of [row.star3, row.star4, row.star5]) {
        expect(Number.isInteger(price) && price > 0, row.city).toBe(true);
      }
      expect(row.star3 < row.star4 && row.star4 < row.star5, row.city).toBe(true);
    }
  });

  it("names a known source for every row", () => {
    for (const { row } of rows) {
      expect(row.sources.length, row.city).toBeGreaterThan(0);
      for (const source of row.sources) expect(RATE_SOURCES[source], `${row.city}: ${source}`).toBeTruthy();
    }
  });

  it("never gives two rows the same name, so a city can't match the wrong figures", () => {
    const seen = new Map<string, string>();
    for (const { row } of rows) {
      for (const name of [row.city, ...row.aliases]) {
        const key = normalise(name);
        expect(seen.get(key), `${name} is both ${seen.get(key)} and ${row.city}`).toBeUndefined();
        seen.set(key, row.city);
      }
    }
  });

  it("keeps a derived row on the 0.6 and 2.1 ratios it was worked out with", () => {
    // A derived class was worked out from the 4-star price; a reading would
    // only hit its ratio by chance. (Maafushi's 3 and 4-star are readings, its
    // 5-star is derived from its 4-star.) Each price was rounded to ₹100 on its
    // own, so allow that rounding: up to ₹50 on each, times the ratio on the 4-star.
    for (const { row } of rows) {
      if (row.derivedTiers.includes("budget")) {
        expect(Math.abs(row.star3 - row.star4 * 0.6), row.city).toBeLessThanOrEqual(50 + 50 * 0.6);
      }
      if (row.derivedTiers.includes("upscale")) {
        expect(Math.abs(row.star5 - row.star4 * 2.1), row.city).toBeLessThanOrEqual(50 + 50 * 2.1);
      }
    }
  });

  it("says which classes of a row were derived, and the 4-star is always a reading", () => {
    for (const { row } of rows) {
      expect(row.derived, row.city).toBe(row.derivedTiers.length > 0);
      expect(row.derivedTiers, row.city).not.toContain("mid");
    }
    const byCity = (name: string) => rows.find(({ row }) => row.city === name)!.row;
    expect(byCity("Phuket").derivedTiers).toEqual(["budget", "upscale"]);
    expect(byCity("Maafushi").derivedTiers).toEqual(["upscale"]);
    expect(byCity("Paris").derivedTiers).toEqual([]);
  });

  it("starts each country with an ordinary hotel city, since the others are priced from it", () => {
    for (const [code, list] of Object.entries(HOTEL_RATES)) {
      expect(list[0].city, code).not.toBe("Masai Mara");
    }
  });
});

describe("the kinds of place", () => {
  const appCities = (code: string) => countryByCode(code)?.cities.map((city) => city.name) ?? [];

  it("names only cities the app or the table knows, in a country it knows", () => {
    for (const [code, kinds] of Object.entries(CITY_KINDS)) {
      expect(countryByCode(code), code).toBeTruthy();
      const known = new Set([...appCities(code), ...(HOTEL_RATES[code] ?? []).map((row) => row.city)]);
      for (const city of Object.keys(kinds)) expect(known.has(city), `${code}: ${city}`).toBe(true);
    }
  });

  it("gives no kind to a country's main city, which the others are scaled from", () => {
    for (const [code, list] of Object.entries(HOTEL_RATES)) {
      expect(CITY_KINDS[code]?.[list[0].city], list[0].city).toBeUndefined();
    }
  });

  it("gives a kind to every other ordinary row, so every pair counts", () => {
    for (const [code, list] of Object.entries(HOTEL_RATES)) {
      for (const row of list.slice(1)) {
        if (row.city === "Masai Mara") continue;
        expect(CITY_KINDS[code]?.[row.city], row.city).toBeTruthy();
      }
    }
  });

  it("gives a kind to every app city that has no figures, where its country has some", () => {
    for (const country of COUNTRIES) {
      const list = HOTEL_RATES[country.code] ?? [];
      if (list.length === 0) continue;
      for (const city of country.cities) {
        // A row of its own, by name or alias (Ubud is priced as Bali).
        if (lookupCityRates(city.name, country.name).basis === "city") continue;
        expect(CITY_KINDS[country.code]?.[city.name], city.name).toBeTruthy();
      }
    }
  });

  it("works each kind's ratio out as the median 4-star ratio of its pairs", () => {
    const byKind = new Map<CityKind, number[]>();
    for (const [code, list] of Object.entries(HOTEL_RATES)) {
      const [main, ...others] = list;
      for (const row of others) {
        const kind = CITY_KINDS[code]?.[row.city];
        if (!kind || row.city === "Masai Mara") continue;
        byKind.set(kind, [...(byKind.get(kind) ?? []), row.star4 / main.star4]);
      }
    }
    expect([...KIND_RATIOS.keys()].sort()).toEqual(["beach", "city", "heritage", "nature"]);
    for (const [kind, ratios] of byKind) {
      const sorted = [...ratios].sort((a, b) => a - b);
      const m = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      expect(KIND_RATIOS.get(kind), kind).toEqual({ ratio: Math.round(m * 100) / 100, pairs: ratios.length });
      // Enough pairs for a median to mean something.
      expect(ratios.length, kind).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("lookupCityRates", () => {
  it("finds a city's own figures", () => {
    const delhi = lookupCityRates("Delhi", "India");
    expect(delhi).toMatchObject({ basis: "city", from: "Delhi", countryCode: "IN" });
    expect(delhi.prices).toEqual({ budget: 2_700, mid: 3_600, upscale: 15_000 });
  });

  it("matches other names, accents, letter case and a trailing country", () => {
    // `basis: "city"` matters: a miss would fall back to the country's main
    // city, and Delhi is India's, so `from` alone can't tell a match from a miss.
    const own = (city: string, destination: string, from: string) =>
      expect(lookupCityRates(city, destination), city).toMatchObject({ basis: "city", from });
    own("New Delhi", "India", "Delhi");
    own("Bangalore", "India", "Bengaluru");
    own("Ubud", "Indonesia", "Bali");
    own("Cancun", "Mexico", "Cancún");
    own("SAO PAULO", "Brazil", "São Paulo");
    own("Delhi, India", "India", "Delhi");
    own("Mumbai, India", "India", "Mumbai");
    own("Kyoto, Japan", "Japan", "Kyoto");
    own("  kyoto ", "Japan", "Kyoto");
  });

  it("prices a city with no figures and no kind from its country's main city, as it is", () => {
    const kochi = lookupCityRates("Kochi", "India");
    expect(kochi).toMatchObject({ basis: "country", from: "Delhi", confidence: "low" });
    expect(kochi.prices).toEqual({ budget: 2_700, mid: 3_600, upscale: 15_000 });
    expect(kochi.kind).toBeUndefined();
    // Not from Masai Mara's safari camps.
    expect(lookupCityRates("Lamu", "Kenya")).toMatchObject({ basis: "country", from: "Nairobi" });
  });

  it("uses only its own country's figures for a city it doesn't know", () => {
    // Paris is in the table, but a "Paris" in India is not Paris, France.
    expect(lookupCityRates("Paris", "India")).toMatchObject({ basis: "country", from: "Delhi" });
  });

  it("falls back to the region's median for a country with no figures at all", () => {
    // Mauritius has no row, so its cities have no main city to be modelled from.
    const grandBaie = lookupCityRates("Grand Baie", "Mauritius");
    expect(grandBaie).toMatchObject({ basis: "region", from: "Africa", countryCode: "MU", confidence: "low" });
    expect(grandBaie.kind).toBeUndefined();
    expect(grandBaie.prices.budget).toBeLessThan(grandBaie.prices.mid);
    expect(grandBaie.prices.mid).toBeLessThan(grandBaie.prices.upscale);
  });

  it("models a city with no figures from its main city and its kind", () => {
    // Athens 12,800 for a 4-star, times the beach ratio 1.59: ₹20,352, to the ₹100.
    expect(lookupCityRates("Santorini", "Greece")).toEqual({
      prices: { budget: 12_200, mid: 20_400, upscale: 42_800 },
      basis: "modelled",
      from: "Athens",
      countryCode: "GR",
      confidence: "low",
      kind: "beach",
      derivedTiers: [],
    });
    // Modelled from Nairobi, never from Masai Mara's safari camps.
    expect(lookupCityRates("Diani Beach", "Kenya")).toMatchObject({ basis: "modelled", from: "Nairobi", kind: "beach" });
    // Matched like any city name: accents, letter case, a trailing country.
    expect(lookupCityRates("cesky krumlov, Czechia", "Czechia")).toMatchObject({ basis: "modelled", kind: "heritage" });
    // ø is not an accent on an o, so it needs its own rule to match "Tromso".
    expect(lookupCityRates("  TROMSØ ", "Norway")).toMatchObject({ basis: "modelled", kind: "nature" });
    expect(lookupCityRates("Tromso", "Norway")).toMatchObject({ basis: "modelled", kind: "nature" });
  });

  it("scales every class by its kind's one ratio, rounded to ₹100", () => {
    for (const [code, kinds] of Object.entries(CITY_KINDS)) {
      const main = HOTEL_RATES[code]?.[0];
      for (const city of Object.keys(kinds)) {
        const found = lookupCityRates(city, countryByCode(code)!.name);
        if (found.basis !== "modelled") continue;
        const ratio = KIND_RATIOS.get(kinds[city])!.ratio;
        expect(found.prices, city).toEqual({
          budget: Math.round((main.star3 * ratio) / 100) * 100,
          mid: Math.round((main.star4 * ratio) / 100) * 100,
          upscale: Math.round((main.star5 * ratio) / 100) * 100,
        });
      }
    }
  });

  it("uses only its own country's kinds", () => {
    // Santorini is a beach town in Greece; a "Santorini" in Italy is not.
    expect(lookupCityRates("Santorini", "Italy")).toMatchObject({ basis: "country", from: "Rome" });
  });

  it("keeps safari camps out of a region's median", () => {
    // Africa's 4-star median without Masai Mara: the median of the African rows.
    const africa = rows.filter(({ code, row }) => countryByCode(code)?.region === "Africa" && row.city !== "Masai Mara");
    const mids = africa.map(({ row }) => row.star4).sort((a, b) => a - b);
    const middle = Math.floor(mids.length / 2);
    const expected = mids.length % 2 ? mids[middle] : Math.round((mids[middle - 1] + mids[middle]) / 2);
    expect(lookupCityRates("Grand Baie", "Mauritius").prices.mid).toBe(expected);
  });

  it("still knows a city on a trip whose destination isn't a supported country", () => {
    expect(lookupCityRates("Paris", "Somewhere")).toMatchObject({ basis: "city", from: "Paris", countryCode: "FR" });
  });

  it("falls back to the worldwide median when it knows neither", () => {
    const unknown = lookupCityRates("Testville", "Testland");
    expect(unknown).toMatchObject({ basis: "world", from: "", countryCode: null, confidence: "low" });
    expect(unknown.prices.budget).toBeLessThan(unknown.prices.mid);
    expect(unknown.prices.mid).toBeLessThan(unknown.prices.upscale);
  });

  it("finds rising prices for every city of every supported country", () => {
    for (const country of COUNTRIES) {
      for (const city of country.cities) {
        const { prices } = lookupCityRates(city.name, country.name);
        expect(prices.budget > 0 && prices.budget < prices.mid && prices.mid < prices.upscale, city.name).toBe(true);
      }
    }
  });
});

describe("withLocalTax", () => {
  it("adds 5% GST in India up to ₹7,500 a night and 18% above it", () => {
    expect(withLocalTax(2_700, "IN")).toBe(2_835);
    expect(withLocalTax(7_500, "IN")).toBe(7_875);
    expect(withLocalTax(7_501, "IN")).toBe(8_851);
    expect(withLocalTax(15_000, "IN")).toBe(17_700);
  });

  it("adds nothing elsewhere, or when the country isn't known", () => {
    expect(withLocalTax(10_000, "FR")).toBe(10_000);
    expect(withLocalTax(10_000, null)).toBe(10_000);
  });
});

describe("chooseTier", () => {
  const prices = { budget: 3_000, mid: 6_000, upscale: 15_000 };

  it("takes the dearest class that fits", () => {
    expect(chooseTier(prices, 20_000)).toBe("upscale");
    expect(chooseTier(prices, 14_999)).toBe("mid");
    expect(chooseTier(prices, 5_999)).toBe("budget");
  });

  it("counts a price equal to the limit as fitting", () => {
    expect(chooseTier(prices, 15_000)).toBe("upscale");
    expect(chooseTier(prices, 6_000)).toBe("mid");
    expect(chooseTier(prices, 3_000)).toBe("budget");
  });

  it("uses 3-star when nothing fits", () => {
    expect(chooseTier(prices, 1_000)).toBe("budget");
    expect(chooseTier(prices, 0)).toBe("budget");
  });

  it("uses 4-star when there is no limit to go by", () => {
    expect(chooseTier(prices, null)).toBe("mid");
    expect(chooseTier(prices, Number.NaN)).toBe("mid");
  });
});

describe("hotelRate", () => {
  it("chooses the class on the price with tax, and returns that price", () => {
    // Delhi 5-star is ₹15,000, ₹17,700 with GST: a ₹16,000 limit is not enough.
    expect(hotelRate({ city: "Delhi", destination: "India", maxPerNightInr: 16_000 })).toEqual({
      tier: "mid",
      basis: "city",
      from: "Delhi",
      includesTax: true,
      perNightInr: 3_780,
      confidence: "medium",
    });
    expect(hotelRate({ city: "Delhi", destination: "India", maxPerNightInr: 17_700 }).tier).toBe("upscale");
  });

  it("says what kind of place a modelled price was scaled for, and only then", () => {
    expect(hotelRate({ city: "Santorini", destination: "Greece", maxPerNightInr: null })).toEqual({
      tier: "mid",
      basis: "modelled",
      from: "Athens",
      includesTax: false,
      perNightInr: 20_400,
      confidence: "low",
      kind: "beach",
    });
    // No `kind: undefined` either: a saved trip can't hold an undefined field.
    expect("kind" in hotelRate({ city: "Paris", destination: "France", maxPerNightInr: null })).toBe(false);
    expect("kind" in hotelRate({ city: "Grand Baie", destination: "Mauritius", maxPerNightInr: null })).toBe(false);
  });

  it("keeps a fixed class whatever the budget", () => {
    expect(hotelRate({ city: "Paris", destination: "France", maxPerNightInr: 1, tier: "upscale" })).toMatchObject({
      tier: "upscale",
      perNightInr: 38_100,
      includesTax: false,
    });
  });
});

describe("describeRateBasis", () => {
  it("says where the figure came from", () => {
    expect(describeRateBasis({ tier: "mid", basis: "city", from: "Paris", includesTax: false })).toBe(
      "Typical 4-star price in Paris",
    );
    expect(describeRateBasis({ tier: "budget", basis: "country", from: "Delhi", includesTax: true })).toBe(
      "Based on a typical 3-star in Delhi, incl. GST",
    );
    expect(describeRateBasis({ tier: "upscale", basis: "region", from: "Europe", includesTax: false })).toBe(
      "Rough 5-star estimate from Europe prices",
    );
    expect(describeRateBasis({ tier: "mid", basis: "world", from: "", includesTax: false })).toBe("Rough 4-star estimate");
    expect(describeRateBasis({ tier: "mid", basis: "modelled", from: "Athens", includesTax: false, kind: "beach" })).toBe(
      "Estimated 4-star price for a beach town, from Athens prices",
    );
    expect(describeRateBasis({ tier: "budget", basis: "modelled", from: "Delhi", includesTax: true, kind: "heritage" })).toBe(
      "Estimated 3-star price for a heritage town, from Delhi prices, incl. GST",
    );
    expect(describeRateBasis({ tier: "upscale", basis: "modelled", from: "Oslo", includesTax: false, kind: "nature" })).toBe(
      "Estimated 5-star price for a nature getaway, from Oslo prices",
    );
    expect(describeRateBasis({ tier: "mid", basis: "modelled", from: "Berlin", includesTax: false, kind: "city" })).toBe(
      "Estimated 4-star price for a big city, from Berlin prices",
    );
    // A saved hotel whose kind went missing still reads sensibly.
    expect(describeRateBasis({ tier: "mid", basis: "modelled", from: "Berlin", includesTax: false })).toBe(
      "Estimated 4-star price from Berlin prices",
    );
  });
});

describe("other spellings of a city", () => {
  // A model plans the trip and may spell a city its own way.
  it.each([
    ["Fez", "Morocco", "modelled", "Marrakech"],
    ["Cuzco", "Peru", "modelled", "Lima"],
    ["Kruger", "South Africa", "modelled", "Cape Town"],
    ["Kruger Park", "South Africa", "modelled", "Cape Town"],
    ["Wadi Musa", "Jordan", "modelled", "Amman"],
    ["Köln", "Germany", "modelled", "Berlin"],
    ["Den Haag", "Netherlands", "modelled", "Amsterdam"],
    ["Cesky Krumlov", "Czechia", "modelled", "Prague"],
    ["Oia", "Greece", "modelled", "Athens"],
    ["Marrakesh", "Morocco", "city", "Marrakech"],
    ["Ho Chi Minh", "Vietnam", "city", "Ho Chi Minh City"],
    ["Munchen", "Germany", "city", "Munich"],
    ["München", "Germany", "city", "Munich"],
    ["Lisboa", "Portugal", "city", "Lisbon"],
  ])("knows %s in %s", (name, country, basis, from) => {
    expect(lookupCityRates(name, country), name).toMatchObject({ basis, from });
  });

  it("only gives aliases to cities that have a kind, and none that clash with another name", () => {
    const seen = new Map<string, string>();
    for (const [code, aliases] of Object.entries(CITY_KIND_ALIASES)) {
      for (const [city, others] of Object.entries(aliases)) {
        expect(CITY_KINDS[code]?.[city], `${code}: ${city}`).toBeTruthy();
        for (const name of [city, ...others]) {
          const key = `${code}/${normalise(name)}`;
          expect(seen.get(key), `${name} is both ${seen.get(key)} and ${city}`).toBeUndefined();
          seen.set(key, city);
        }
      }
    }
  });

  it("never lets a spelling of a modelled city belong to a city with a row of its own", () => {
    for (const [code, aliases] of Object.entries(CITY_KIND_ALIASES)) {
      const own = new Set((HOTEL_RATES[code] ?? []).flatMap((row) => [row.city, ...row.aliases].map(normalise)));
      for (const others of Object.values(aliases)) {
        for (const name of others) expect(own.has(normalise(name)), `${code}: ${name}`).toBe(false);
      }
    }
  });
});

describe("shiftTier", () => {
  it("moves one class and stops at the ends", () => {
    expect(shiftTier("upscale", "lower")).toBe("mid");
    expect(shiftTier("mid", "lower")).toBe("budget");
    expect(shiftTier("budget", "lower")).toBe("budget");
    expect(shiftTier("budget", "higher")).toBe("mid");
    expect(shiftTier("mid", "higher")).toBe("upscale");
    expect(shiftTier("upscale", "higher")).toBe("upscale");
  });
});

describe("a class that was worked out, not read", () => {
  const rate = (city: string, destination: string, tier: "budget" | "mid" | "upscale") =>
    hotelRate({ city, destination, maxPerNightInr: null, tier });

  it("is flagged on the 3 and 5-star of a derived row, and never on its 4-star", () => {
    expect(rate("Phuket", "Thailand", "budget").derived).toBe(true);
    expect(rate("Phuket", "Thailand", "upscale").derived).toBe(true);
    expect(rate("Phuket", "Thailand", "mid").derived).toBeUndefined();
  });

  it("is flagged only on the classes a row derived, so Maafushi's 3-star stays a reading", () => {
    expect(rate("Maafushi", "Maldives", "budget").derived).toBeUndefined();
    expect(rate("Maafushi", "Maldives", "upscale").derived).toBe(true);
  });

  it("is not flagged on a row that was read, or on a figure borrowed from another city", () => {
    expect(rate("Paris", "France", "upscale").derived).toBeUndefined();
    expect(rate("Santorini", "Greece", "upscale").derived).toBeUndefined();
    expect(rate("Kochi", "India", "budget").derived).toBeUndefined();
  });

  it("is flagged without a country too, for a trip saved before destinations were limited", () => {
    expect(hotelRate({ city: "Phuket", destination: "Somewhere, Atlantis", maxPerNightInr: null, tier: "upscale" }).derived).toBe(true);
  });

  it("says so in the label, where a reading says 'Typical'", () => {
    expect(describeRateBasis(rateBasisOf(rate("Phuket", "Thailand", "upscale")))).toBe(
      "Estimated 5-star price in Phuket, worked out from its 4-star",
    );
    expect(describeRateBasis(rateBasisOf(rate("Phuket", "Thailand", "mid")))).toBe("Typical 4-star price in Phuket");
    expect(describeRateBasis(rateBasisOf(rate("Delhi", "India", "mid")))).toBe("Typical 4-star price in Delhi, incl. GST");
    expect(describeRateBasis({ tier: "budget", basis: "city", from: "Phuket", includesTax: false, derived: true })).toBe(
      "Estimated 3-star price in Phuket, worked out from its 4-star",
    );
    expect(describeRateBasis({ tier: "upscale", basis: "city", from: "Delhi", includesTax: true, derived: true })).toBe(
      "Estimated 5-star price in Delhi, worked out from its 4-star, incl. GST",
    );
  });
});

describe("rateBasisOf", () => {
  it("keeps what is saved with a hotel, and leaves out the price and the keys that don't apply", () => {
    expect(rateBasisOf(hotelRate({ city: "Paris", destination: "France", maxPerNightInr: null }))).toEqual({
      tier: "mid",
      basis: "city",
      from: "Paris",
      includesTax: false,
    });
    expect(rateBasisOf(hotelRate({ city: "Santorini", destination: "Greece", maxPerNightInr: null }))).toEqual({
      tier: "mid",
      basis: "modelled",
      from: "Athens",
      includesTax: false,
      kind: "beach",
    });
    expect(rateBasisOf(hotelRate({ city: "Phuket", destination: "Thailand", maxPerNightInr: null, tier: "upscale" }))).toEqual({
      tier: "upscale",
      basis: "city",
      from: "Phuket",
      includesTax: false,
      derived: true,
    });
  });

  it("never holds an undefined field, which Firestore would refuse to save", () => {
    for (const country of COUNTRIES) {
      for (const place of country.cities) {
        for (const tier of ["budget", "mid", "upscale"] as const) {
          const saved = rateBasisOf(hotelRate({ city: place.name, destination: country.name, maxPerNightInr: null, tier }));
          for (const [key, value] of Object.entries(saved)) expect(value, `${place.name} ${tier} ${key}`).not.toBeUndefined();
        }
      }
    }
  });
});

describe("how well the kinds of place predict a city", () => {
  // The README says a city's price is predicted better from its kind than from
  // its country's main city as it is. This is that check: leave each city with
  // figures out, predict its 4-star from the others of its kind, and compare.
  it("predicts a left-out city's 4-star better than its main city's price as it is", () => {
    const pairs: { kind: CityKind; ratio: number }[] = [];
    for (const [code, list] of Object.entries(HOTEL_RATES)) {
      const [main, ...others] = list;
      for (const row of others) {
        const kind = CITY_KINDS[code]?.[row.city];
        if (kind && row.city !== "Masai Mara") pairs.push({ kind, ratio: row.star4 / main.star4 });
      }
    }
    const medianOf = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    let modelWithin = 0;
    let flatWithin = 0;
    for (const [i, pair] of pairs.entries()) {
      const rest = pairs.filter((other, j) => j !== i && other.kind === pair.kind).map((other) => other.ratio);
      if (Math.abs(medianOf(rest) / pair.ratio - 1) <= 0.3) modelWithin++;
      if (Math.abs(1 / pair.ratio - 1) <= 0.3) flatWithin++;
    }
    expect(pairs.length).toBe(52);
    expect(modelWithin).toBe(33);
    expect(flatWithin).toBe(28);
  });
});

describe("how many of the app's cities each kind of figure covers", () => {
  // The README says how many cities have figures of their own and how many are
  // modelled; this keeps those numbers true when a row is added or removed.
  it("matches what the README says", () => {
    const count: Record<string, number> = {};
    let cities = 0;
    for (const country of COUNTRIES) {
      for (const place of country.cities) {
        cities++;
        const { basis } = lookupCityRates(place.name, country.name);
        count[basis] = (count[basis] ?? 0) + 1;
      }
    }
    expect(cities).toBe(129);
    expect(count).toEqual({ city: 93, modelled: 34, region: 2 });
  });
});
