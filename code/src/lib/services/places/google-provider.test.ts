import { afterEach, describe, expect, it, vi } from "vitest";
import { fromInr } from "@/lib/fx";
import { budgetCategoryOf } from "@/lib/services/budget-engine";
import { spendPricesFor } from "@/lib/spending/prices";
import { GooglePlacesProvider } from "@/lib/services/places/google-provider";

// Every test uses its own destination, since searches are cached by query.
function stubGoogle(places: unknown[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ places }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).textQuery;
}

const raw = (name: string, priceLevel?: string, types?: string[]) => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  displayName: { text: name },
  ...(priceLevel ? { priceLevel } : {}),
  ...(types ? { types } : {}),
});

afterEach(() => vi.unstubAllGlobals());

describe("GooglePlacesProvider hotel search", () => {
  const provider = new GooglePlacesProvider("test-key");

  it("asks for the class of hotel it is given", async () => {
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Classville", country: "France", type: "hotel", hotelClass: 4 });
    expect(query()).toBe("4 star hotels in Classville, France");
  });

  it("puts the class in front of a search phrase too, for a hotel only", async () => {
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Phraseville", country: "France", type: "hotel", query: "well-rated hotel", hotelClass: 3 });
    expect(query()).toBe("3 star well-rated hotel in Phraseville, France");
    const other = stubGoogle([raw("Some Place")]);
    await provider.searchPlaces({ destination: "Otherville", country: "France", type: "attraction", query: "old town", hotelClass: 3 });
    expect(other()).toBe("old town in Otherville, France");
    const plain = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Namedville", country: "France", type: "hotel", query: "Hotel Lutetia" });
    expect(plain()).toBe("Hotel Lutetia in Namedville, France");
  });

  it("asks for any hotel when no class is given", async () => {
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Anyville", country: "France", type: "hotel" });
    expect(query()).toBe("hotels in Anyville, France");
  });

  it("caches each class separately, so a 3-star search doesn't answer a 5-star one", async () => {
    stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Cacheville", type: "hotel", hotelClass: 3 });
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Cacheville", type: "hotel", hotelClass: 5 });
    expect(query()).toBe("5 star hotels in Cacheville");
  });

  it("gives a hotel no price, even when Google has a price level for it", async () => {
    stubGoogle([raw("Pricey Hotel", "PRICE_LEVEL_EXPENSIVE")]);
    const [hotel] = await provider.searchPlaces({ destination: "Priceville", type: "hotel" });
    expect(hotel.price).toBeNull();
  });

  it("still prices a restaurant from its price level", async () => {
    stubGoogle([raw("Pricey Restaurant", "PRICE_LEVEL_EXPENSIVE")]);
    const [restaurant] = await provider.searchPlaces({ destination: "Dineville", country: "India", type: "restaurant" });
    expect(restaurant.price).toEqual({ amount: spendPricesFor("IN").perPersonInr.upscale, currency: "INR", isEstimate: true });
  });
});

describe("GooglePlacesProvider prices", () => {
  const provider = new GooglePlacesProvider("test-key");
  let n = 0;
  const inCountry = (code: string) => ({ addressComponents: [{ longText: "X", shortText: code, types: ["country"] }] });
  const priceOf = async (
    place: Record<string, unknown>,
    params: { type: "restaurant" | "attraction" | "nightlife"; country?: string; currency?: string },
  ) => {
    stubGoogle([place]);
    const [found] = await provider.searchPlaces({ destination: `Priceville${++n}`, ...params });
    return found.price;
  };
  const india = spendPricesFor("IN").perPersonInr;
  const swiss = spendPricesFor("CH").perPersonInr;

  it("prices each Google level with the country's own figures", async () => {
    const levels = [
      ["PRICE_LEVEL_INEXPENSIVE", india.budget],
      ["PRICE_LEVEL_MODERATE", india.mid],
      ["PRICE_LEVEL_EXPENSIVE", india.upscale],
      ["PRICE_LEVEL_VERY_EXPENSIVE", india.luxury],
      ["PRICE_LEVEL_FREE", 0],
    ] as const;
    for (const [level, amount] of levels) {
      expect(await priceOf(raw("Cafe", level), { type: "restaurant", country: "India" })).toEqual({
        amount,
        currency: "INR",
        isEstimate: true,
      });
    }
  });

  it("gives the same level a different price in a dearer country", async () => {
    const jaipur = await priceOf(raw("Cafe", "PRICE_LEVEL_MODERATE"), { type: "restaurant", country: "India" });
    const zurich = await priceOf(raw("Cafe", "PRICE_LEVEL_MODERATE"), { type: "restaurant", country: "Switzerland" });
    expect(jaipur?.amount).toBe(india.mid);
    expect(zurich?.amount).toBe(swiss.mid);
    expect(swiss.mid).toBeGreaterThan(india.mid * 5);
  });

  it("uses the place's own country before the one searched in", async () => {
    const price = await priceOf({ ...raw("Cafe", "PRICE_LEVEL_MODERATE"), ...inCountry("CH") }, { type: "restaurant", country: "India" });
    expect(price?.amount).toBe(swiss.mid);
  });

  it("converts to the trip's currency", async () => {
    const price = await priceOf(raw("Cafe", "PRICE_LEVEL_MODERATE"), { type: "restaurant", country: "India", currency: "USD" });
    expect(price).toEqual({ amount: fromInr(india.mid, "USD"), currency: "USD", isEstimate: true });
  });

  it("prices a restaurant or a bar with no level as a mid-range one, never as free", async () => {
    expect((await priceOf(raw("Unknown Cafe"), { type: "restaurant", country: "India" }))?.amount).toBe(india.mid);
    expect((await priceOf(raw("Unknown Bar", undefined, ["bar"]), { type: "nightlife", country: "India" }))?.amount).toBe(india.mid);
    expect((await priceOf(raw("Odd Level", "PRICE_LEVEL_UNSPECIFIED"), { type: "restaurant", country: "India" }))?.amount).toBe(india.mid);
  });

  it("gives a sight with no level no price, as before", async () => {
    expect(await priceOf(raw("Old Fort", undefined, ["tourist_attraction"]), { type: "attraction", country: "India" })).toBeNull();
  });

  it("prices a sight that does have a level", async () => {
    const price = await priceOf(raw("Theme Park", "PRICE_LEVEL_EXPENSIVE", ["amusement_park"]), { type: "attraction", country: "India" });
    expect(price?.amount).toBe(india.upscale);
  });
});

describe("GooglePlacesProvider categories", () => {
  const provider = new GooglePlacesProvider("test-key");
  let n = 0;
  const search = async (type: "restaurant" | "attraction" | "nightlife", types: string[]) => {
    stubGoogle([raw("Some Place", undefined, types)]);
    const [place] = await provider.searchPlaces({ destination: `Categoryville${++n}`, type });
    return place;
  };

  it.each([
    ["a bar", ["restaurant", "bar", "food"]],
    ["a night club", ["night_club", "restaurant"]],
    ["a store", ["store", "restaurant", "food"]],
    ["a market", ["market", "restaurant"]],
    ["a tourist attraction", ["tourist_attraction", "restaurant"]],
    ["a spa", ["spa", "restaurant"]],
    ["nothing else", ["restaurant"]],
    ["no types at all", []],
  ])("keeps a restaurant that Google also calls %s as food, so it is paid for as a meal", async (_label, types) => {
    const place = await search("restaurant", types);
    expect(place.category).toBe("food");
    expect(place.styleTags).toEqual(["food"]);
    expect(budgetCategoryOf(place)).toBe("food");
  });

  it("leaves the other kinds of search as they were", async () => {
    expect((await search("attraction", ["shopping_mall"])).category).toBe("shopping");
    expect((await search("attraction", ["museum"])).category).toBe("culture");
    expect((await search("attraction", ["restaurant", "bar"])).category).toBe("nightlife");
    expect((await search("nightlife", ["bar"])).category).toBe("nightlife");
    expect((await search("nightlife", ["restaurant"])).category).toBe("food");
    expect((await search("nightlife", [])).category).toBe("nightlife");
    expect((await search("attraction", [])).category).toBe("sightseeing");
  });
});

describe("GooglePlacesProvider: which country a place is in", () => {
  const provider = new GooglePlacesProvider("test-key");
  const withCountry = (name: string, country: Record<string, unknown> | null) => ({
    ...raw(name),
    ...(country ? { addressComponents: [{ longText: "Panaji", types: ["locality"] }, { ...country, types: ["country", "political"] }] } : {}),
  });

  it("reads the country's two-letter code, in capitals", async () => {
    stubGoogle([
      withCountry("Fort", { longText: "India", shortText: "IN" }),
      withCountry("Beach", { longText: "India", shortText: " in " }),
    ]);
    const places = await provider.searchPlaces({ destination: "Codeville", country: "India", type: "attraction" });
    expect(places.map((p) => [p.country, p.countryCode])).toEqual([
      ["India", "IN"],
      ["India", "IN"],
    ]);
  });

  it("leaves it empty rather than guessing when Google gives none, or something that isn't a code", async () => {
    stubGoogle([
      withCountry("No Address", null),
      withCountry("No Short", { longText: "India" }),
      withCountry("Long Short", { longText: "India", shortText: "IND" }),
      withCountry("Odd Short", { longText: "India", shortText: "I1" }),
    ]);
    const places = await provider.searchPlaces({ destination: "Nocodeville", country: "India", type: "attraction" });
    expect(places.map((p) => p.countryCode)).toEqual([null, null, null, null]);
  });
});
