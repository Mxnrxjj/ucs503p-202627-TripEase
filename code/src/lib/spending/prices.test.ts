import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/countries";
import { MEAL_PRICES, SPEND_SOURCES, USD_TO_INR } from "@/lib/spending/price-data";
import {
  dailyFoodInr,
  LUXURY_OVER_UPSCALE,
  MEALS_PER_DAY,
  priceLevelInr,
  SPEND_TIERS,
  spendPricesFor,
  tierOfPriceLevel,
  tiersFromUsd,
  UPSCALE_OVER_MID,
} from "@/lib/spending/prices";

describe("the meal price data", () => {
  it("covers every supported country but Bhutan, and nothing else", () => {
    const supported = new Set(COUNTRIES.map((c) => c.code));
    for (const code of Object.keys(MEAL_PRICES)) expect(supported.has(code), code).toBe(true);
    const missing = COUNTRIES.map((c) => c.code).filter((code) => !MEAL_PRICES[code]);
    expect(missing).toEqual(["BT"]);
  });

  it("has sane figures: positive, a mid-range meal for two above one cheap meal, and a known source", () => {
    for (const [code, row] of Object.entries(MEAL_PRICES)) {
      expect(row.inexpensive, code).toBeGreaterThan(0);
      expect(row.midForTwo, code).toBeGreaterThan(row.inexpensive);
      expect(row.sources.length, code).toBeGreaterThan(0);
      for (const source of row.sources) expect(SPEND_SOURCES[source], code).toBeTruthy();
      expect(row.confidence === "medium", code).toBe(row.sources.includes("numbeo-mid"));
    }
  });
});

describe("spendPricesFor", () => {
  it("reads a country's own figures: India", () => {
    const india = spendPricesFor("IN");
    expect(india.basis).toBe("country");
    expect(india.from).toBe("India");
    expect(india.confidence).toBe("medium");
    // $2.09 and $14.33 / 2 at ₹94.20, rounded to ₹10.
    expect(india.perPersonInr).toEqual({ budget: 200, mid: 670, upscale: 1_690, luxury: 3_370 });
  });

  it("works out each tier from the data and the two modelled ratios", () => {
    const row = MEAL_PRICES.JP;
    const mid = (row.midForTwo / 2) * USD_TO_INR;
    expect(spendPricesFor("JP").perPersonInr).toEqual({
      budget: Math.round((row.inexpensive * USD_TO_INR) / 10) * 10,
      mid: Math.round(mid / 10) * 10,
      upscale: Math.round((mid * UPSCALE_OVER_MID) / 10) * 10,
      luxury: Math.round((mid * UPSCALE_OVER_MID * LUXURY_OVER_UPSCALE) / 10) * 10,
    });
  });

  it("accepts a code in any case and with spaces", () => {
    expect(spendPricesFor(" in ")).toEqual(spendPricesFor("IN"));
  });

  it("never lets a dearer tier cost less than a cheaper one, in any supported country", () => {
    for (const country of COUNTRIES) {
      const prices = spendPricesFor(country.code).perPersonInr;
      for (let i = 1; i < SPEND_TIERS.length; i++) {
        expect(prices[SPEND_TIERS[i]], `${country.code} ${SPEND_TIERS[i]}`).toBeGreaterThanOrEqual(prices[SPEND_TIERS[i - 1]]);
      }
      expect(prices.budget, country.code).toBeGreaterThan(0);
    }
  });

  it("prices Bhutan from South Asia, and says so", () => {
    const bhutan = spendPricesFor("BT");
    expect(bhutan.basis).toBe("region");
    expect(bhutan.from).toBe("South Asia");
    expect(bhutan.confidence).toBe("low");
    // The median of India, Nepal, Sri Lanka and the Maldives: between India's figures and the Maldives'.
    expect(bhutan.perPersonInr.mid).toBeGreaterThan(spendPricesFor("IN").perPersonInr.mid);
    expect(bhutan.perPersonInr.mid).toBeLessThan(spendPricesFor("MV").perPersonInr.mid);
  });

  it("falls back to everywhere's median for an unknown or missing country", () => {
    const world = spendPricesFor("ZZ");
    expect(world.basis).toBe("world");
    expect(world.from).toBe("");
    expect(spendPricesFor(null)).toEqual(world);
    expect(spendPricesFor(undefined)).toEqual(world);
    expect(spendPricesFor("")).toEqual(world);
  });

  it("marks a country from a secondary page as low confidence", () => {
    expect(spendPricesFor("IS").confidence).toBe("low");
    expect(spendPricesFor("IS").basis).toBe("country");
  });

  it("puts Switzerland far above India, as the data says", () => {
    expect(spendPricesFor("CH").perPersonInr.budget).toBeGreaterThan(spendPricesFor("IN").perPersonInr.budget * 10);
  });
});

describe("Google price levels", () => {
  it("maps each level to a tier", () => {
    expect(tierOfPriceLevel("PRICE_LEVEL_INEXPENSIVE")).toBe("budget");
    expect(tierOfPriceLevel("PRICE_LEVEL_MODERATE")).toBe("mid");
    expect(tierOfPriceLevel("PRICE_LEVEL_EXPENSIVE")).toBe("upscale");
    expect(tierOfPriceLevel("PRICE_LEVEL_VERY_EXPENSIVE")).toBe("luxury");
    expect(tierOfPriceLevel("PRICE_LEVEL_FREE")).toBeNull();
    expect(tierOfPriceLevel("PRICE_LEVEL_UNSPECIFIED")).toBeNull();
    expect(tierOfPriceLevel(undefined)).toBeNull();
    expect(tierOfPriceLevel("toString")).toBeNull();
  });

  it("prices a level in the country's rupees, free as 0, and nothing for an unknown level", () => {
    expect(priceLevelInr("PRICE_LEVEL_MODERATE", "IN")).toBe(670);
    expect(priceLevelInr("PRICE_LEVEL_VERY_EXPENSIVE", "IN")).toBe(3_370);
    expect(priceLevelInr("PRICE_LEVEL_FREE", "IN")).toBe(0);
    expect(priceLevelInr("PRICE_LEVEL_UNSPECIFIED", "IN")).toBeNull();
    expect(priceLevelInr(null, "IN")).toBeNull();
  });
});

describe("dailyFoodInr", () => {
  it("is three meals at the tier's price", () => {
    expect(MEALS_PER_DAY).toBe(3);
    expect(dailyFoodInr("budget", spendPricesFor("IN"))).toBe(600);
    expect(dailyFoodInr("mid", spendPricesFor("IN"))).toBe(2_010);
  });
});

describe("tiersFromUsd", () => {
  it("never prices a mid-range meal below an inexpensive one, whatever the figures say", () => {
    const tiers = tiersFromUsd(10, 6); // $3 a head for "mid-range", below the $10 cheap meal
    expect(tiers.mid).toBe(tiers.budget);
    expect(tiers.upscale).toBe(Math.round((10 * USD_TO_INR * UPSCALE_OVER_MID) / 10) * 10);
  });

  it("never prices anything below ₹10", () => {
    expect(tiersFromUsd(0.01, 0.02)).toEqual({ budget: 10, mid: 10, upscale: 10, luxury: 10 });
  });

  it("does not find Object's own properties as countries", () => {
    expect(spendPricesFor("constructor").basis).toBe("world");
    expect(spendPricesFor("__proto__").basis).toBe("world");
  });
});
