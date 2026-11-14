import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetCategoryOf } from "@/lib/services/budget-engine";
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
    const [restaurant] = await provider.searchPlaces({ destination: "Dineville", type: "restaurant" });
    expect(restaurant.price).toEqual({ amount: 3_500, currency: "INR", isEstimate: true });
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
